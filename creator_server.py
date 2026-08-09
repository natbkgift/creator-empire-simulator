#!/usr/bin/env python3
"""Creator Empire Simulator local server v1.5.

Security / reliability contract:
- SQLite is the durable workspace store with revision history and transactional writes.
- API keys are NEVER persisted in SQLite. They come from environment variables or
  optional session-only memory entered from the local UI.
- OpenAI Responses requests use store=false and bounded output tokens.
- AI requests are retried only for transient failures and are constrained by local budgets.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import mimetypes
import os
import secrets
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone, timedelta
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.environ.get("CREATOR_EMPIRE_DB", DATA_DIR / "creator_empire.sqlite"))
SESSION_KEYS: dict[str, str] = {}
MAX_HISTORY = 80
AI_RUN_LOCK = threading.Lock()
AUTOPILOT_WAKE = threading.Event()
YOUTUBE_WAKE = threading.Event()
WORKER_STOP = threading.Event()
AUTOPILOT_THREAD: threading.Thread | None = None
YOUTUBE_THREAD: threading.Thread | None = None
OAUTH_STATES: dict[str, tuple[float, str]] = {}
VIDEO_UPLOAD_DIR = Path(os.environ.get("CREATOR_EMPIRE_UPLOAD_DIR", DATA_DIR / "uploads"))
MAX_VIDEO_BYTES = int(os.environ.get("CREATOR_EMPIRE_MAX_VIDEO_BYTES", str(2 * 1024 * 1024 * 1024)))
SUPPORTED_PROMPT_TYPES = (
    "niche-research", "topic-research", "fact-check", "competitor-pattern", "hook-generator",
    "shorts-script", "long-script", "storyboard", "capcut-standard", "capcut-director",
    "ai-image", "ai-video", "thumbnail-title", "repurposing", "analytics-postmortem", "next-video",
    "autopilot-plan", "autopilot-package",
)
OPENAI_DEFAULT_MODEL = "gpt-5.6-luna"
OPENAI_ADVANCED_MODEL = "gpt-5.6-terra"
# 3 of 16 default routes use Terra (18.75%). Important scripts can be promoted per run.
OPENAI_ADVANCED_PROMPT_TYPES = frozenset({"niche-research", "fact-check", "analytics-postmortem"})
RESEARCH_PROMPT_TYPES = frozenset({"niche-research", "topic-research", "fact-check", "competitor-pattern"})


@contextlib.contextmanager
def db_conn(timeout: float = 5.0) -> Any:
    conn = sqlite3.connect(DB_PATH, timeout=timeout)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()



def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def checksum_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def checksum_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in conn.execute(f"pragma table_info({table})").fetchall()}


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute("select 1 from sqlite_master where type='table' and name=?", (table,)).fetchone() is not None


def ensure_column(conn: sqlite3.Connection, table: str, name: str, declaration: str) -> None:
    if name not in column_names(conn, table):
        conn.execute(f"alter table {table} add column {name} {declaration}")


def ensure_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    legacy_secret_table = False
    with db_conn() as conn:
        conn.execute("pragma journal_mode=wal")
        conn.execute("pragma synchronous=full")
        conn.execute("pragma foreign_keys=on")
        conn.execute("pragma secure_delete=on")
        conn.execute("""
        create table if not exists workspace (
          id text primary key,
          data text not null,
          schema_version integer not null,
          revision integer not null default 0,
          checksum text not null default '',
          updated_at text not null
        )
        """)
        ensure_column(conn, "workspace", "revision", "integer not null default 0")
        ensure_column(conn, "workspace", "checksum", "text not null default ''")
        conn.execute("""
        create table if not exists workspace_history (
          id integer primary key autoincrement,
          workspace_id text not null,
          revision integer not null,
          checksum text not null,
          data text not null,
          created_at text not null,
          unique(workspace_id, revision)
        )
        """)
        conn.execute("""
        create table if not exists ai_runs (
          id integer primary key autoincrement,
          provider text not null,
          model text not null,
          created_at text not null,
          prompt_chars integer not null,
          response_chars integer not null,
          input_tokens integer not null default 0,
          output_tokens integer not null default 0,
          search_queries integer not null default 0,
          estimated_cost_usd real not null default 0,
          ok integer not null,
          error text
        )
        """)
        for name, decl in (
            ("input_tokens", "integer not null default 0"),
            ("output_tokens", "integer not null default 0"),
            ("search_queries", "integer not null default 0"),
            ("estimated_cost_usd", "real not null default 0"),
        ):
            ensure_column(conn, "ai_runs", name, decl)
        conn.execute("""
        create table if not exists autopilot_jobs (
          id text primary key,
          status text not null,
          stage text not null,
          progress integer not null default 0,
          request_json text not null,
          package_json text,
          error text,
          cancel_requested integer not null default 0,
          created_at text not null,
          updated_at text not null,
          approved_at text
        )
        """)
        conn.execute("""
        create table if not exists autopilot_steps (
          id integer primary key autoincrement,
          job_id text not null,
          step_index integer not null,
          kind text not null,
          prompt_type text not null,
          model_tier text not null,
          status text not null,
          attempts integer not null default 0,
          input_json text,
          output_json text,
          input_tokens integer not null default 0,
          output_tokens integer not null default 0,
          search_queries integer not null default 0,
          estimated_cost_usd real not null default 0,
          error text,
          started_at text,
          completed_at text,
          unique(job_id, step_index)
        )
        """)
        conn.execute("""
        create table if not exists youtube_connections (
          id text primary key,
          encrypted_token_json text not null,
          scope text not null,
          created_at text not null,
          updated_at text not null
        )
        """)
        conn.execute("""
        create table if not exists video_assets (
          id text primary key,
          project_id text,
          filename text not null,
          stored_path text not null,
          content_type text not null,
          size_bytes integer not null,
          sha256 text not null,
          status text not null,
          created_at text not null,
          expires_at text not null
        )
        """)
        conn.execute("""
        create table if not exists youtube_uploads (
          id text primary key,
          asset_id text not null,
          status text not null,
          progress integer not null default 0,
          metadata_json text not null,
          encrypted_session_uri text,
          uploaded_bytes integer not null default 0,
          video_id text,
          video_url text,
          error text,
          created_at text not null,
          updated_at text not null
        )
        """)
        # v1.2 persisted plaintext provider keys. Secure-delete rows before removing the table.
        legacy_secret_table = table_exists(conn, "ai_secrets")
        if legacy_secret_table:
            conn.execute("delete from ai_secrets")
            conn.execute("drop table ai_secrets")
        conn.commit()

    # Repack the database and truncate WAL only when a legacy plaintext-secret table existed.
    # This makes the v1.2 -> v1.3 migration actively remove recoverable free-page copies.
    if legacy_secret_table:
        with db_conn() as conn:
            conn.execute("pragma secure_delete=on")
            conn.execute("vacuum")
            conn.execute("pragma wal_checkpoint(truncate)")


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Referrer-Policy", "same-origin")
    handler.send_header("X-Frame-Options", "DENY")
    handler.end_headers()
    handler.wfile.write(body)


def binary_response(handler: BaseHTTPRequestHandler, status: int, body: bytes, content_type: str, filename: str | None = None) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    if filename:
        handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    handler.end_headers()
    handler.wfile.write(body)


def redirect_response(handler: BaseHTTPRequestHandler, location: str) -> None:
    handler.send_response(302)
    handler.send_header("Location", location)
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Referrer-Policy", "no-referrer")
    handler.end_headers()


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("content-length", "0"))
    if length > 10_000_000:
        raise ValueError("Request body too large")
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def validate_request_origin(handler: BaseHTTPRequestHandler) -> None:
    origin = handler.headers.get("Origin", "").strip()
    if not origin:
        return
    forwarded_proto = handler.headers.get("X-Forwarded-Proto", "").split(",", 1)[0].strip()
    scheme = forwarded_proto or ("https" if handler.server.server_port == 443 else "http")
    host = handler.headers.get("Host", "").strip()
    if not host or origin.rstrip("/") != f"{scheme}://{host}".rstrip("/"):
        raise PermissionError("Cross-origin state changes are not allowed")


def workspace_row(conn: sqlite3.Connection) -> tuple[Any, ...] | None:
    return conn.execute(
        "select data, schema_version, revision, checksum, updated_at from workspace where id='default'"
    ).fetchone()


def verified_workspace_from_row(row: tuple[Any, ...] | None) -> dict[str, Any] | None:
    if not row:
        return None
    data = str(row[0])
    expected = str(row[3] or "")
    if expected and checksum_text(data) != expected:
        raise RuntimeError("Workspace checksum mismatch. Use IndexedDB reconciliation or recovery history.")
    workspace = json.loads(data)
    if not isinstance(workspace, dict):
        raise RuntimeError("Workspace row is not a JSON object")
    workspace["revision"] = int(row[2])
    return workspace


def db_storage_meta() -> dict[str, Any]:
    with db_conn() as conn:
        row = workspace_row(conn)
        history_count = conn.execute(
            "select count(*) from workspace_history where workspace_id='default'"
        ).fetchone()[0]
    return {
        "dbPath": str(DB_PATH),
        "savedAt": row[4] if row else None,
        "revision": int(row[2]) if row else 0,
        "checksum": str(row[3]) if row else "",
        "historyCount": int(history_count),
    }


def normalize_revision(workspace: dict[str, Any], current_revision: int) -> int:
    requested = int(workspace.get("revision", 0) or 0)
    return max(current_revision + 1, requested)


def save_workspace(payload: dict[str, Any]) -> dict[str, Any]:
    workspace = payload.get("workspace")
    if not isinstance(workspace, dict):
        raise ValueError("workspace must be an object")
    schema_version = int(workspace.get("schemaVersion", 0) or 0)
    updated_at = now_iso()
    with db_conn(timeout=10) as conn:
        conn.execute("pragma foreign_keys=on")
        conn.execute("pragma synchronous=full")
        conn.execute("begin immediate")
        row = workspace_row(conn)
        current_revision = int(row[2]) if row else 0
        revision = normalize_revision(workspace, current_revision)
        workspace = dict(workspace)
        workspace["revision"] = revision
        workspace["updatedAt"] = workspace.get("updatedAt") or updated_at
        data = canonical_json(workspace)
        digest = checksum_text(data)
        if row:
            previous_checksum = str(row[3] or checksum_text(str(row[0])))
            conn.execute(
                "insert or ignore into workspace_history(workspace_id,revision,checksum,data,created_at) values(?,?,?,?,?)",
                ("default", current_revision, previous_checksum, row[0], row[4]),
            )
        conn.execute(
            "insert into workspace(id,data,schema_version,revision,checksum,updated_at) values(?,?,?,?,?,?) "
            "on conflict(id) do update set data=excluded.data,schema_version=excluded.schema_version,"
            "revision=excluded.revision,checksum=excluded.checksum,updated_at=excluded.updated_at",
            ("default", data, schema_version, revision, digest, updated_at),
        )
        conn.execute(
            "delete from workspace_history where id in ("
            "select id from workspace_history where workspace_id='default' order by revision desc limit -1 offset ?)",
            (MAX_HISTORY,),
        )
        conn.commit()
    return {"ok": True, "workspace": workspace, "storage": db_storage_meta()}


def load_workspace() -> dict[str, Any]:
    with db_conn() as conn:
        row = workspace_row(conn)
    return {"workspace": verified_workspace_from_row(row), "storage": db_storage_meta()}


def list_history() -> dict[str, Any]:
    with db_conn() as conn:
        rows = conn.execute(
            "select revision,checksum,created_at from workspace_history where workspace_id='default' "
            "order by revision desc limit 30"
        ).fetchall()
    return {
        "history": [
            {"revision": int(row[0]), "checksum": row[1], "createdAt": row[2]} for row in rows
        ]
    }


def restore_revision(payload: dict[str, Any]) -> dict[str, Any]:
    revision = int(payload.get("revision", -1))
    with sqlite3.connect(DB_PATH, timeout=10) as conn:
        conn.execute("pragma synchronous=full")
        conn.execute("begin immediate")
        row = conn.execute(
            "select data,checksum from workspace_history where workspace_id='default' and revision=?", (revision,)
        ).fetchone()
        if not row:
            raise ValueError("Revision not found")
        data_from_history = str(row[0])
        history_checksum = str(row[1] or "")
        if history_checksum and checksum_text(data_from_history) != history_checksum:
            raise RuntimeError("Recovery snapshot checksum mismatch")
        workspace = json.loads(data_from_history)
        current = workspace_row(conn)
        current_revision = int(current[2]) if current else revision
        new_revision = current_revision + 1
        workspace["revision"] = new_revision
        workspace["updatedAt"] = now_iso()
        data = canonical_json(workspace)
        digest = checksum_text(data)
        if current:
            conn.execute(
                "insert or ignore into workspace_history(workspace_id,revision,checksum,data,created_at) values(?,?,?,?,?)",
                ("default", current_revision, current[3] or checksum_text(str(current[0])), current[0], current[4]),
            )
        conn.execute(
            "insert into workspace(id,data,schema_version,revision,checksum,updated_at) values(?,?,?,?,?,?) "
            "on conflict(id) do update set data=excluded.data,schema_version=excluded.schema_version,"
            "revision=excluded.revision,checksum=excluded.checksum,updated_at=excluded.updated_at",
            ("default", data, int(workspace.get("schemaVersion", 0)), new_revision, digest, now_iso()),
        )
        conn.commit()
    return {"ok": True, "workspace": workspace, "storage": db_storage_meta(), "restoredFrom": revision}


def env_key_name(provider: str) -> str:
    return "OPENAI_API_KEY" if provider == "openai" else "GEMINI_API_KEY"


def mask_key(value: str) -> str:
    if not value:
        return ""
    return f"{value[:4]}…{value[-4:]}" if len(value) > 10 else "configured"


def provider_key(provider: str) -> tuple[str, str]:
    env_name = env_key_name(provider)
    env_value = os.environ.get(env_name, "").strip()
    if env_value:
        return env_value, "environment"
    session = SESSION_KEYS.get(provider, "").strip()
    if session:
        return session, "session"
    raise ValueError(f"{provider} API key is not configured. Set {env_name} or add a session-only key in Settings.")


def secret_status() -> dict[str, Any]:
    providers: dict[str, Any] = {}
    for provider in ("openai", "gemini"):
        try:
            key, source = provider_key(provider)
            providers[provider] = {
                "configured": True,
                "maskedKey": mask_key(key),
                "source": source,
                "persistent": source == "environment",
            }
        except ValueError:
            providers[provider] = {
                "configured": False,
                "maskedKey": "",
                "source": "none",
                "persistent": False,
            }
    return {"providers": providers}


def save_session_secret(payload: dict[str, Any]) -> dict[str, Any]:
    provider = str(payload.get("provider", "")).strip().lower()
    api_key = str(payload.get("apiKey", "")).strip()
    if provider not in {"openai", "gemini"}:
        raise ValueError("provider must be openai or gemini")
    if not api_key:
        raise ValueError("apiKey is required")
    SESSION_KEYS[provider] = api_key
    return secret_status()


def delete_session_secret(provider: str) -> dict[str, Any]:
    if provider not in {"openai", "gemini"}:
        raise ValueError("provider must be openai or gemini")
    SESSION_KEYS.pop(provider, None)
    return secret_status()


def load_settings() -> dict[str, Any]:
    try:
        payload = load_workspace().get("workspace")
        if isinstance(payload, dict) and isinstance(payload.get("settings"), dict):
            return payload["settings"]
    except Exception:
        pass
    return {}


def numeric_setting(settings: dict[str, Any], key: str, default: float, low: float, high: float) -> float:
    try:
        value = float(settings.get(key, default))
    except (TypeError, ValueError):
        value = default
    return min(high, max(low, value))


def ai_spend(period: str) -> float:
    if period == "day":
        cutoff = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")
    else:
        cutoff = datetime.now(timezone.utc).strftime("%Y-%m-01T00:00:00Z")
    with db_conn() as conn:
        row = conn.execute(
            "select coalesce(sum(estimated_cost_usd),0) from ai_runs where ok=1 and created_at>=?", (cutoff,)
        ).fetchone()
    return float(row[0] or 0)


def provider_rates(provider: str, settings: dict[str, Any], model: str = "") -> tuple[float, float]:
    if provider == "openai":
        advanced_model = str(settings.get("openAiAdvancedModel") or OPENAI_ADVANCED_MODEL).strip()
        prefix = "openAiAdvanced" if model == advanced_model else "openAi"
    else:
        prefix = "gemini"
    return (
        numeric_setting(settings, f"{prefix}InputUsdPer1M", 0, 0, 1000),
        numeric_setting(settings, f"{prefix}OutputUsdPer1M", 0, 0, 1000),
    )


def estimate_cost(provider: str, input_tokens: int, output_tokens: int, settings: dict[str, Any], search_queries: int = 0, model: str = "") -> float:
    input_rate, output_rate = provider_rates(provider, settings, model)
    token_cost = (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000
    search_rate = numeric_setting(
        settings,
        "openAiSearchUsdPerQuery" if provider == "openai" else "geminiSearchUsdPerQuery",
        0.01 if provider == "openai" else 0.014,
        0,
        10,
    )
    search_cost = search_queries * search_rate
    return token_cost + search_cost


def budget_limits(settings: dict[str, Any]) -> tuple[float, float]:
    daily = numeric_setting(settings, "aiDailyBudgetUsd", 2.0, 0, 10_000)
    monthly = numeric_setting(settings, "aiMonthlyBudgetUsd", 20.0, 0, 100_000)
    hard_daily = numeric_setting({"value": os.environ.get("CREATOR_EMPIRE_MAX_DAILY_USD")}, "value", 0, 0, 10_000)
    hard_monthly = numeric_setting({"value": os.environ.get("CREATOR_EMPIRE_MAX_MONTHLY_USD")}, "value", 0, 0, 100_000)
    if hard_daily:
        daily = min(daily, hard_daily) if daily else hard_daily
    if hard_monthly:
        monthly = min(monthly, hard_monthly) if monthly else hard_monthly
    return daily, monthly


def enforce_budget(provider: str, settings: dict[str, Any], model: str = "") -> None:
    daily, monthly = budget_limits(settings)
    input_rate, output_rate = provider_rates(provider, settings, model)
    if (daily or monthly) and input_rate <= 0 and output_rate <= 0:
        raise RuntimeError(f"Configure current {provider} input/output USD per 1M token rates before enabling cost-capped AI Assisted mode")
    if daily and ai_spend("day") >= daily:
        raise RuntimeError(f"Daily AI budget reached (${daily:.2f})")
    if monthly and ai_spend("month") >= monthly:
        raise RuntimeError(f"Monthly AI budget reached (${monthly:.2f})")


def post_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: float, attempts: int = 3) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(attempts):
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # Do not persist provider response bodies: they may echo user content.
            exc.read()
            last_error = RuntimeError(f"Provider HTTP {exc.code}: request rejected")
            if exc.code not in {408, 409, 429, 500, 502, 503, 504} or attempt == attempts - 1:
                raise last_error from exc
            retry_after = exc.headers.get("Retry-After", "") if exc.headers else ""
            try:
                retry_delay = max(0.0, float(retry_after))
            except ValueError:
                retry_delay = 0.0
            fallback_delay = 15.0 if exc.code == 429 else 0.75 * (2**attempt)
            time.sleep(min(30.0, max(retry_delay, fallback_delay)))
            continue
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = RuntimeError(f"Network error: {type(exc).__name__}")
            if attempt == attempts - 1:
                raise last_error from exc
        time.sleep(0.75 * (2**attempt))
    raise last_error or RuntimeError("AI request failed")


def openai_response_schema(prompt_type: str) -> dict[str, Any] | None:
    schema = gemini_response_schema(prompt_type)
    if not schema:
        return None

    def strictify(node: Any) -> Any:
        if isinstance(node, list):
            return [strictify(item) for item in node]
        if not isinstance(node, dict):
            return node
        result = {key: strictify(value) for key, value in node.items()}
        if result.get("type") == "object":
            properties = result.get("properties") if isinstance(result.get("properties"), dict) else {}
            result["required"] = list(properties)
            result["additionalProperties"] = False
        return result

    return strictify(schema)


def route_openai_model(settings: dict[str, Any], prompt_type: str = "", use_advanced: bool = False) -> tuple[str, str, str]:
    default_model = str(settings.get("openAiModel") or OPENAI_DEFAULT_MODEL).strip() or OPENAI_DEFAULT_MODEL
    advanced_model = str(settings.get("openAiAdvancedModel") or OPENAI_ADVANCED_MODEL).strip() or OPENAI_ADVANCED_MODEL
    advanced = use_advanced or prompt_type in OPENAI_ADVANCED_PROMPT_TYPES
    return (advanced_model, "terra", "medium") if advanced else (default_model, "luna", "low")


def call_openai(
    prompt: str,
    model: str,
    api_key: str,
    max_output_tokens: int,
    timeout: float,
    prompt_type: str = "",
    reasoning_effort: str = "low",
) -> tuple[str, int, int, int]:
    request_payload: dict[str, Any] = {
        "model": model,
        "input": prompt,
        "store": False,
        "max_output_tokens": max_output_tokens,
        "reasoning": {"effort": reasoning_effort},
    }
    schema = openai_response_schema(prompt_type)
    if schema:
        request_payload["text"] = {
            "format": {
                "type": "json_schema",
                "name": f"creator_{prompt_type.replace('-', '_')}",
                "description": "Structured result for a Creator Empire workflow",
                "strict": True,
                "schema": schema,
            }
        }
    else:
        request_payload["text"] = {"format": {"type": "json_object"}}
    if prompt_type in RESEARCH_PROMPT_TYPES:
        request_payload["tools"] = [{"type": "web_search"}]
        request_payload["tool_choice"] = "required"
    total_input_tokens = 0
    total_output_tokens = 0
    total_search_queries = 0
    repair_instruction = ""
    last_reason = "provider returned no valid structured text"
    for response_attempt in range(2):
        request_payload["input"] = prompt + repair_instruction
        data = post_json(
            "https://api.openai.com/v1/responses",
            {"Authorization": f"Bearer {api_key}"},
            request_payload,
            timeout,
        )
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        total_input_tokens += int(usage.get("input_tokens", 0) or 0)
        total_output_tokens += int(usage.get("output_tokens", 0) or 0)
        if data.get("status") == "incomplete":
            details = data.get("incomplete_details") if isinstance(data.get("incomplete_details"), dict) else {}
            last_reason = f"incomplete: {str(details.get('reason') or 'unknown')[:80]}"
            if response_attempt == 0:
                repair_instruction = (
                    "\n\nRELIABILITY REPAIR: Return the same result as compact valid JSON. "
                    "Keep arrays concise, finish every sentence, and close every object and array."
                )
                continue
            raise RuntimeError(f"OpenAI response {last_reason}")
        chunks: list[str] = []
        if isinstance(data.get("output_text"), str):
            chunks.append(data["output_text"])
        for item in data.get("output", []) if isinstance(data.get("output"), list) else []:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "web_search_call":
                total_search_queries += 1
            for content in item.get("content", []) if isinstance(item.get("content"), list) else []:
                if isinstance(content, dict) and content.get("type") == "refusal":
                    raise RuntimeError("OpenAI declined this request")
                if isinstance(content, dict) and isinstance(content.get("text"), str):
                    chunks.append(content["text"])
        text = "\n".join(dict.fromkeys(filter(None, chunks))).strip()
        if text:
            try:
                json.loads(text)
                return text, total_input_tokens, total_output_tokens, total_search_queries
            except json.JSONDecodeError:
                last_reason = "invalid structured JSON"
        if response_attempt == 0:
            repair_instruction = (
                "\n\nRELIABILITY REPAIR: Return compact valid JSON only. "
                "Keep arrays concise, finish every sentence, and close every object and array."
            )
            continue
    raise RuntimeError(f"OpenAI produced {last_reason} after one structured repair")


def gemini_response_schema(prompt_type: str) -> dict[str, Any] | None:
    string = {"type": "string", "maxLength": 240}
    narrative = {"type": "string", "maxLength": 12_000}
    strings = {"type": "array", "items": string, "maxItems": 8}
    integer = {"type": "integer"}
    number = {"type": "number"}
    boolean = {"type": "boolean"}

    def object_array(properties: dict[str, Any], required: list[str], max_items: int = 8) -> dict[str, Any]:
        return {"type": "array", "items": {"type": "object", "properties": properties, "required": required}, "maxItems": max_items}

    sources = object_array({"title": string, "url": string, "publisher": string, "claimType": string, "notes": string}, ["title", "url"], 4)
    scenes = object_array({"start": number, "end": number, "narration": string, "visual": string, "onScreenText": string, "sourceNote": string}, ["start", "end", "visual"], 14)
    asset_prompts = object_array({"scene": string, "prompt": string, "durationSeconds": number, "aspectRatio": string, "negativeConstraints": strings}, ["scene", "prompt"], 12)
    fields: dict[str, tuple[str, dict[str, Any]]] = {
        "niche-research": ("summary", {"summary": string, "sources": sources, "topicClusters": strings, "validationSprint": object_array({"title": string, "format": string, "reason": string}, ["title", "format"], 12), "risks": strings, "nextAction": string}),
        "topic-research": ("summary", {"summary": string, "sources": sources, "verifiedFacts": strings, "disputedClaims": strings, "nextAction": string}),
        "fact-check": ("safeSummary", {"safeSummary": string, "claims": object_array({"claim": string, "status": string, "evidence": string, "caveat": string}, ["claim", "status"], 3), "blockingIssues": strings, "sources": sources, "revisedScript": narrative}),
        "competitor-pattern": ("summary", {"summary": string, "sources": sources, "patterns": object_array({"pattern": string, "evidence": string, "application": string}, ["pattern", "application"]), "doNotCopy": strings, "transformedPrinciples": strings, "nextAction": string}),
        "hook-generator": ("hooks", {"hooks": object_array({"text": string, "pattern": string, "whyItWorks": string}, ["text", "pattern"], 12), "recommendedIndex": integer}),
        "shorts-script": ("script", {"title": string, "hook": string, "script": narrative, "durationSeconds": integer, "factCaveats": strings, "nextAction": string}),
        "long-script": ("script", {"title": string, "hook": string, "script": narrative, "durationSeconds": integer, "factCaveats": strings, "nextAction": string}),
        "storyboard": ("scenes", {"title": string, "durationSeconds": integer, "scenes": scenes, "disclosure": string}),
        "capcut-standard": ("capcutBrief", {"recommendedMode": string, "capcutBrief": narrative, "durationSeconds": integer, "scenes": scenes, "settings": {"type": "object", "properties": {"aspectRatio": string, "voice": string, "captions": string, "avatar": boolean, "regenerationLimit": integer}}, "disclosure": string}),
        "capcut-director": ("capcutBrief", {"recommendedMode": string, "capcutBrief": narrative, "durationSeconds": integer, "scenes": scenes, "settings": {"type": "object", "properties": {"aspectRatio": string, "voice": string, "captions": string, "avatar": boolean, "regenerationLimit": integer}}, "disclosure": string}),
        "ai-image": ("assetPrompts", {"assetPrompts": asset_prompts, "continuityRules": strings, "nextAction": string}),
        "ai-video": ("assetPrompts", {"assetPrompts": asset_prompts, "continuityRules": strings, "nextAction": string}),
        "thumbnail-title": ("titles", {"titles": strings, "thumbnailConcepts": strings, "recommendedTitle": string, "nextAction": string}),
        "repurposing": ("repurposingPlan", {"repurposingPlan": narrative, "platformPlans": object_array({"platform": string, "hook": string, "caption": string, "cta": string, "durationSeconds": integer}, ["platform", "hook"], 8), "nextAction": string}),
        "analytics-postmortem": ("analyticsPostmortem", {"analyticsPostmortem": narrative, "diagnosis": strings, "winningSignals": strings, "nextActions": object_array({"action": string, "impact": string, "effortMinutes": integer}, ["action", "impact"]), "nextVideoIdeas": strings}),
        "next-video": ("nextVideoIdeas", {"diagnosis": strings, "nextVideoIdeas": object_array({"title": string, "reason": string, "format": string, "priority": integer}, ["title", "reason"], 5), "nextAction": string}),
        "autopilot-plan": ("title", {"title": string, "angle": string, "hook": string, "contentPlan": strings}),
        "autopilot-package": ("description", {"description": narrative, "tags": strings, "thumbnailText": string, "storyboard": strings, "assetPrompts": strings, "capcutBrief": narrative, "canvaBrief": narrative, "repurposingPlan": narrative, "captionsSrt": narrative, "syntheticMediaDisclosure": string}),
    }
    spec = fields.get(prompt_type)
    if not spec:
        return None
    _primary_field, properties = spec
    return {"type": "object", "properties": properties, "required": list(properties)}


def call_gemini(prompt: str, model: str, api_key: str, max_output_tokens: int, timeout: float, prompt_type: str = "", thinking_level: str = "low") -> tuple[str, int, int, int]:
    encoded_model = urllib.parse.quote(model, safe="")
    generation_config: dict[str, Any] = {
        "maxOutputTokens": max_output_tokens,
        "responseMimeType": "application/json",
    }
    schema = gemini_response_schema(prompt_type)
    if schema:
        generation_config["responseSchema"] = schema
    if model.startswith("gemini-3"):
        generation_config["thinkingConfig"] = {"thinkingLevel": thinking_level}
    elif model.startswith("gemini-2.5"):
        generation_config["thinkingConfig"] = {"thinkingBudget": 256 if thinking_level in {"medium", "high"} else 0}
    input_tokens = 0
    output_tokens = 0
    search_queries = 0
    retry_instruction = ""
    for response_attempt in range(2):
        request_payload: dict[str, Any] = {
            "contents": [{"parts": [{"text": prompt + retry_instruction}]}],
            "generationConfig": generation_config,
        }
        if model.startswith("gemini-3") and prompt_type in RESEARCH_PROMPT_TYPES:
            request_payload["tools"] = [{"google_search": {}}]
        data = post_json(
            f"https://generativelanguage.googleapis.com/v1beta/models/{encoded_model}:generateContent",
            {"x-goog-api-key": api_key},
            request_payload,
            timeout,
        )
        parts: list[str] = []
        for candidate in data.get("candidates", []) if isinstance(data.get("candidates"), list) else []:
            content = candidate.get("content", {}) if isinstance(candidate, dict) else {}
            for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    parts.append(part["text"])
            grounding = candidate.get("groundingMetadata", {}) if isinstance(candidate, dict) else {}
            queries = grounding.get("webSearchQueries", []) if isinstance(grounding, dict) else []
            search_queries += len(queries) if isinstance(queries, list) else 0
        usage = data.get("usageMetadata") if isinstance(data.get("usageMetadata"), dict) else {}
        input_tokens += int(usage.get("promptTokenCount", 0) or 0)
        output_tokens += int(usage.get("candidatesTokenCount", 0) or 0)
        result = "\n".join(parts).strip()
        if result:
            try:
                json.loads(result)
                return result, input_tokens, output_tokens, search_queries
            except json.JSONDecodeError as exc:
                if response_attempt == 0:
                    retry_instruction = (
                        "\n\nRELIABILITY RETRY: The previous answer did not fit. Return compact valid JSON only, "
                        "use at most one item per array, keep each non-script string under 160 characters, and close every object and array."
                    )
                    continue
                raise RuntimeError("Gemini produced incomplete structured JSON after one compact retry") from exc
        feedback = data.get("promptFeedback") if isinstance(data.get("promptFeedback"), dict) else {}
        candidate_reasons = [
            str(item.get("finishReason") or item.get("finishMessage") or "").strip()
            for item in data.get("candidates", []) if isinstance(item, dict)
        ] if isinstance(data.get("candidates"), list) else []
        reason = str(feedback.get("blockReason") or next((item for item in candidate_reasons if item), "provider returned no text"))[:120]
        if response_attempt == 0 and reason.upper() == "RECITATION":
            retry_instruction = "\n\nWrite an original paraphrase. Do not reproduce memorized or copyrighted wording."
            continue
        raise RuntimeError(f"Gemini response unavailable: {reason}")
    raise RuntimeError("Gemini response unavailable after a safe paraphrase retry")


def ai_generate(payload: dict[str, Any]) -> dict[str, Any]:
    provider = str(payload.get("provider") or "openai").strip().lower()
    if provider not in {"openai", "gemini"}:
        raise ValueError("provider must be openai or gemini")
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    if len(prompt) > 100_000:
        raise ValueError("prompt exceeds the 100,000 character limit")
    prompt_type = str(payload.get("promptType") or "").strip()
    if prompt_type and prompt_type not in SUPPORTED_PROMPT_TYPES:
        raise ValueError("unsupported promptType")
    with AI_RUN_LOCK:
        settings = load_settings()
        model_tier = "provider-default"
        reasoning_effort = "provider-default"
        if provider == "openai":
            model, model_tier, reasoning_effort = route_openai_model(
                settings, prompt_type, payload.get("useAdvancedModel") is True
            )
        else:
            default_model = str(settings.get("geminiModel") or "").strip()
            model = str(payload.get("model") or default_model).strip()
        if not model:
            raise ValueError("model is required")
        enforce_budget(provider, settings, model)
        api_key, key_source = provider_key(provider)
        max_tokens = int(numeric_setting(settings, "aiMaxOutputTokens", 2500, 128, 16000))
        requested_tokens = int(payload.get("maxOutputTokens", max_tokens) or max_tokens)
        max_tokens = min(max_tokens, max(128, requested_tokens))
        timeout = numeric_setting(settings, "aiRequestTimeoutSeconds", 60, 10, 180)
        ok = 0
        error: str | None = None
        text = ""
        input_tokens = 0
        output_tokens = 0
        search_queries = 0
        estimated_cost = 0.0
        try:
            if provider == "openai":
                text, input_tokens, output_tokens, search_queries = call_openai(
                    prompt, model, api_key, max_tokens, timeout, prompt_type, reasoning_effort
                )
            else:
                thinking_level = str(settings.get("geminiThinkingLevel") or "low").strip().lower()
                if thinking_level not in {"minimal", "low", "medium", "high"}:
                    thinking_level = "low"
                text, input_tokens, output_tokens, search_queries = call_gemini(prompt, model, api_key, max_tokens, timeout, prompt_type, thinking_level)
            estimated_cost = estimate_cost(provider, input_tokens, output_tokens, settings, search_queries, model)
            daily, monthly = budget_limits(settings)
            if daily and ai_spend("day") + estimated_cost > daily:
                raise RuntimeError("This run would exceed the daily AI budget")
            if monthly and ai_spend("month") + estimated_cost > monthly:
                raise RuntimeError("This run would exceed the monthly AI budget")
            parsed_text = json.loads(text)
            if isinstance(parsed_text, dict):
                parsed_text["_providerGenerated"] = provider
                parsed_text["_groundedSearchQueries"] = search_queries
                text = json.dumps(parsed_text, ensure_ascii=False)
            ok = 1
            return {
                "ok": True,
                "provider": provider,
                "model": model,
                "modelTier": model_tier,
                "reasoningEffort": reasoning_effort,
                "promptType": prompt_type or None,
                "text": text,
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "searchQueries": search_queries,
                "estimatedCostUsd": round(estimated_cost, 6),
                "keySource": key_source,
                "createdAt": now_iso(),
            }
        except Exception as exc:  # noqa: BLE001
            error = str(exc)[:300]
            raise
        finally:
            with db_conn() as conn:
                conn.execute(
                    "insert into ai_runs(provider,model,created_at,prompt_chars,response_chars,input_tokens,output_tokens,search_queries,estimated_cost_usd,ok,error) "
                    "values(?,?,?,?,?,?,?,?,?,?,?)",
                    (provider, model, now_iso(), len(prompt), len(text), input_tokens, output_tokens, search_queries, estimated_cost, ok, error),
                )


AUTOPILOT_STEPS: tuple[tuple[str, str, str], ...] = (
    ("research", "topic-research", "luna"),
    ("content-plan", "autopilot-plan", "luna"),
    ("script", "shorts-script", "luna"),
    ("fact-check", "fact-check", "terra"),
    ("production-pack", "autopilot-package", "luna"),
)


def _json_object(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    parsed = json.loads(value)
    return parsed if isinstance(parsed, dict) else {}


def _autopilot_spec(request_payload: dict[str, Any]) -> tuple[tuple[str, str, str], ...]:
    script_type = "long-script" if request_payload.get("format") == "long" else "shorts-script"
    return tuple((kind, script_type if kind == "script" else prompt_type, tier) for kind, prompt_type, tier in AUTOPILOT_STEPS)


def _autopilot_prompt(kind: str, request_payload: dict[str, Any], results: dict[str, dict[str, Any]]) -> str:
    topic = str(request_payload.get("topic") or "").strip()
    language = "Thai" if request_payload.get("language") == "th" else "English"
    duration = int(request_payload.get("durationSeconds") or 30)
    channel = request_payload.get("channel") if isinstance(request_payload.get("channel"), dict) else {}
    context = json.dumps(results, ensure_ascii=False)[:45_000]
    base = (
        f"Create original {language} creator content for topic: {topic}. "
        f"Format: {request_payload.get('format')}; target duration: {duration} seconds. "
        f"Channel: {channel.get('name', 'Creator channel')} — {channel.get('promise', '')}. "
        "Never invent facts, quotes, metrics, sources, or capabilities. Return JSON only."
    )
    if kind == "research":
        return base + " Research the topic with current primary or authoritative web sources. Separate verified facts and disputed claims."
    if kind == "content-plan":
        return base + f" Use this grounded research: {context}. Produce one focused title, angle, hook, and concise content plan suited to AI-generated visuals."
    if kind == "script":
        return base + f" Use the approved research and plan: {context}. Write a natural spoken script with a strong first two seconds and a specific payoff."
    if kind == "fact-check":
        return base + f" Audit the research and draft script with web evidence: {context}. Return a corrected revisedScript, safe summary, blockers, claims, and sources."
    return base + (
        f" Build the final production handoff from this verified work: {context}. Include description, tags, thumbnail text, storyboard, "
        "AI image/video prompts, CapCut brief, Canva brief, repurposing plan, valid SRT captions, and synthetic-media disclosure."
    )


def _step_dict(row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "index": int(row[0]), "kind": row[1], "promptType": row[2], "modelTier": row[3], "status": row[4],
        "attempts": int(row[5]), "inputTokens": int(row[6]), "outputTokens": int(row[7]),
        "searchQueries": int(row[8]), "estimatedCostUsd": round(float(row[9]), 6), "error": row[10],
    }


def _job_payload(job_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        row = conn.execute(
            "select id,status,stage,progress,request_json,package_json,error,created_at,updated_at,approved_at "
            "from autopilot_jobs where id=?", (job_id,)
        ).fetchone()
        if not row:
            raise KeyError("Autopilot job not found")
        step_rows = conn.execute(
            "select step_index,kind,prompt_type,model_tier,status,attempts,input_tokens,output_tokens,search_queries,estimated_cost_usd,error "
            "from autopilot_steps where job_id=? order by step_index", (job_id,)
        ).fetchall()
    return {
        "id": row[0], "status": row[1], "stage": row[2], "progress": int(row[3]),
        "request": _json_object(row[4]), "package": _json_object(row[5]) or None, "error": row[6],
        "steps": [_step_dict(item) for item in step_rows], "createdAt": row[7], "updatedAt": row[8], "approvedAt": row[9],
    }


def create_autopilot_job(payload: dict[str, Any]) -> dict[str, Any]:
    topic = str(payload.get("topic") or "").strip()
    if len(topic) < 3 or len(topic) > 500:
        raise ValueError("topic must contain 3 to 500 characters")
    format_value = str(payload.get("format") or "shorts")
    if format_value not in {"shorts", "long"}:
        raise ValueError("format must be shorts or long")
    language = str(payload.get("language") or "th")
    if language not in {"th", "en"}:
        raise ValueError("language must be th or en")
    duration = max(15, min(3600, int(payload.get("durationSeconds") or (30 if format_value == "shorts" else 480))))
    raw_channel = payload.get("channel") if isinstance(payload.get("channel"), dict) else {}
    channel = {
        "key": str(raw_channel.get("key") or "ai-native"),
        "name": str(raw_channel.get("name") or "AI Native Channel")[:120],
        "niche": str(raw_channel.get("niche") or "AI-assisted explainers")[:240],
        "promise": str(raw_channel.get("promise") or "Clear, useful content made efficiently")[:300],
        "aiFitScore": max(0, min(100, int(raw_channel.get("aiFitScore") or 90))),
    }
    request_payload = {"topic": topic, "format": format_value, "durationSeconds": duration, "language": language, "channel": channel}
    job_id = f"job_{uuid.uuid4().hex}"
    created = now_iso()
    with db_conn() as conn:
        conn.execute(
            "insert into autopilot_jobs(id,status,stage,progress,request_json,created_at,updated_at) values(?,?,?,?,?,?,?)",
            (job_id, "queued", "research", 0, canonical_json(request_payload), created, created),
        )
        for index, (kind, prompt_type, tier) in enumerate(_autopilot_spec(request_payload)):
            conn.execute(
                "insert into autopilot_steps(job_id,step_index,kind,prompt_type,model_tier,status) values(?,?,?,?,?,?)",
                (job_id, index, kind, prompt_type, tier, "pending"),
            )
    AUTOPILOT_WAKE.set()
    return {"ok": True, "job": _job_payload(job_id)}


def get_autopilot_job(job_id: str) -> dict[str, Any]:
    return {"ok": True, "job": _job_payload(job_id)}


def list_autopilot_jobs(limit: int = 20) -> dict[str, Any]:
    with db_conn() as conn:
        ids = [row[0] for row in conn.execute("select id from autopilot_jobs order by created_at desc limit ?", (max(1, min(100, limit)),)).fetchall()]
    return {"ok": True, "jobs": [_job_payload(job_id) for job_id in ids]}


def _set_job_attention(job_id: str, stage: str, message: str) -> None:
    with db_conn() as conn:
        conn.execute(
            "update autopilot_jobs set status='needs_attention',stage=?,error=?,updated_at=? where id=?",
            (stage, message[:300], now_iso(), job_id),
        )


def _build_autopilot_package(request_payload: dict[str, Any], results: dict[str, dict[str, Any]], steps: list[dict[str, Any]]) -> dict[str, Any]:
    research = results.get("research", {})
    plan = results.get("content-plan", {})
    draft = results.get("script", {})
    fact = results.get("fact-check", {})
    production = results.get("production-pack", {})
    raw_sources = [*(research.get("sources") if isinstance(research.get("sources"), list) else []), *(fact.get("sources") if isinstance(fact.get("sources"), list) else [])]
    sources: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for raw in raw_sources:
        if not isinstance(raw, dict):
            continue
        url = str(raw.get("url") or "")
        key = url or str(raw.get("title") or "")
        if not key or key in seen_urls:
            continue
        seen_urls.add(key)
        sources.append({"title": str(raw.get("title") or "Source"), "url": url, "publisher": str(raw.get("publisher") or ""), "notes": str(raw.get("notes") or raw.get("evidence") or "")})
    script = str(fact.get("revisedScript") or draft.get("script") or "").strip()
    title = str(plan.get("title") or draft.get("title") or request_payload["topic"]).strip()
    luna_calls = sum(1 for step in steps if step["modelTier"] == "luna" and step["status"] == "completed")
    terra_calls = sum(1 for step in steps if step["modelTier"] == "terra" and step["status"] == "completed")
    total_calls = max(1, luna_calls + terra_calls)
    return {
        "research": {
            "summary": str(research.get("summary") or ""), "sources": sources,
            "risks": [str(item) for item in fact.get("blockingIssues", []) if isinstance(item, str)],
        },
        "channel": request_payload["channel"],
        "contentPlan": {
            "title": title, "angle": str(plan.get("angle") or ""), "hook": str(plan.get("hook") or draft.get("hook") or ""),
            "durationSeconds": int(request_payload["durationSeconds"]), "language": request_payload["language"],
        },
        "script": {
            "narration": script, "factCheckSummary": str(fact.get("safeSummary") or ""),
            "factCaveats": [str(item) for item in draft.get("factCaveats", []) if isinstance(item, str)],
        },
        "metadata": {
            "title": title, "description": str(production.get("description") or ""),
            "tags": [str(item) for item in production.get("tags", []) if isinstance(item, str)],
            "thumbnailText": str(production.get("thumbnailText") or title[:45]),
            "syntheticMediaDisclosure": str(production.get("syntheticMediaDisclosure") or "Review and disclose realistic synthetic media when required."),
        },
        "handoff": {
            "storyboard": [str(item) for item in production.get("storyboard", []) if isinstance(item, str)],
            "assetPrompts": [str(item) for item in production.get("assetPrompts", []) if isinstance(item, str)],
            "capcutBrief": str(production.get("capcutBrief") or ""), "canvaBrief": str(production.get("canvaBrief") or ""),
            "repurposingPlan": str(production.get("repurposingPlan") or ""),
            "captionsSrt": str(production.get("captionsSrt") or f"1\n00:00:00,000 --> 00:00:{min(59, int(request_payload['durationSeconds'])):02d},000\n{script}"),
        },
        "modelUsage": {
            "lunaCalls": luna_calls, "terraCalls": terra_calls,
            "lunaPercent": round(luna_calls * 100 / total_calls, 1), "terraPercent": round(terra_calls * 100 / total_calls, 1),
            "estimatedCostUsd": round(sum(float(step["estimatedCostUsd"]) for step in steps), 6),
        },
        "generatedAt": now_iso(),
    }


def process_autopilot_job(job_id: str) -> None:
    job = _job_payload(job_id)
    if job["status"] in {"approved", "cancelled", "review_ready"}:
        return
    request_payload = job["request"]
    with db_conn() as conn:
        conn.execute("update autopilot_jobs set status='running',error=null,updated_at=? where id=?", (now_iso(), job_id))
    results: dict[str, dict[str, Any]] = {}
    with db_conn() as conn:
        completed = conn.execute("select kind,output_json from autopilot_steps where job_id=? and status='completed'", (job_id,)).fetchall()
    for kind, output_json in completed:
        results[str(kind)] = _json_object(output_json)
    spec = _autopilot_spec(request_payload)
    for index, (kind, prompt_type, tier) in enumerate(spec):
        with db_conn() as conn:
            state = conn.execute("select cancel_requested from autopilot_jobs where id=?", (job_id,)).fetchone()
            current = conn.execute("select status from autopilot_steps where job_id=? and step_index=?", (job_id, index)).fetchone()
        if state and state[0]:
            with db_conn() as conn:
                conn.execute("update autopilot_jobs set status='cancelled',stage=?,updated_at=? where id=?", (kind, now_iso(), job_id))
            return
        if current and current[0] == "completed":
            continue
        prompt = _autopilot_prompt(kind, request_payload, results)
        with db_conn() as conn:
            conn.execute(
                "update autopilot_steps set status='running',attempts=attempts+1,input_json=?,error=null,started_at=? where job_id=? and step_index=?",
                (canonical_json({"prompt": prompt}), now_iso(), job_id, index),
            )
            conn.execute("update autopilot_jobs set stage=?,progress=?,updated_at=? where id=?", (kind, int(index * 100 / len(spec)), now_iso(), job_id))
        try:
            response = ai_generate({
                "provider": "openai", "prompt": prompt, "promptType": prompt_type,
                "useAdvancedModel": tier == "terra", "maxOutputTokens": 6000 if kind in {"script", "production-pack"} else 3000,
            })
            if kind in {"research", "fact-check"} and int(response.get("searchQueries") or 0) < 1:
                raise RuntimeError(f"{kind} requires grounded web search evidence")
            output = _json_object(str(response.get("text") or "{}"))
            output.pop("_providerGenerated", None)
            output.pop("_groundedSearchQueries", None)
            results[kind] = output
            with db_conn() as conn:
                conn.execute(
                    "update autopilot_steps set status='completed',output_json=?,input_tokens=?,output_tokens=?,search_queries=?,estimated_cost_usd=?,error=null,completed_at=? where job_id=? and step_index=?",
                    (canonical_json(output), int(response.get("inputTokens") or 0), int(response.get("outputTokens") or 0), int(response.get("searchQueries") or 0), float(response.get("estimatedCostUsd") or 0), now_iso(), job_id, index),
                )
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)[:300]
            with db_conn() as conn:
                conn.execute("update autopilot_steps set status='failed',error=? where job_id=? and step_index=?", (last_error, job_id, index))
            _set_job_attention(job_id, kind, last_error)
            return
    completed_job = _job_payload(job_id)
    package = _build_autopilot_package(request_payload, results, completed_job["steps"])
    with db_conn() as conn:
        conn.execute(
            "update autopilot_jobs set status='review_ready',stage='ready',progress=100,package_json=?,error=null,updated_at=? where id=?",
            (canonical_json(package), now_iso(), job_id),
        )


def retry_autopilot_job(job_id: str) -> dict[str, Any]:
    job = _job_payload(job_id)
    if job["status"] not in {"needs_attention", "cancelled"}:
        raise ValueError("Only failed or cancelled jobs can be retried")
    with db_conn() as conn:
        conn.execute("update autopilot_steps set status='pending',error=null where job_id=? and status='failed'", (job_id,))
        conn.execute("update autopilot_jobs set status='queued',cancel_requested=0,error=null,updated_at=? where id=?", (now_iso(), job_id))
    AUTOPILOT_WAKE.set()
    return get_autopilot_job(job_id)


def cancel_autopilot_job(job_id: str) -> dict[str, Any]:
    job = _job_payload(job_id)
    with db_conn() as conn:
        if job["status"] == "queued":
            conn.execute("update autopilot_jobs set status='cancelled',cancel_requested=1,updated_at=? where id=?", (now_iso(), job_id))
        elif job["status"] == "running":
            conn.execute("update autopilot_jobs set cancel_requested=1,updated_at=? where id=?", (now_iso(), job_id))
    return get_autopilot_job(job_id)


def approve_autopilot_job(job_id: str) -> dict[str, Any]:
    job = _job_payload(job_id)
    if job["status"] not in {"review_ready", "approved"}:
        raise ValueError("Job is not ready for approval")
    with db_conn() as conn:
        conn.execute("update autopilot_jobs set status='approved',approved_at=coalesce(approved_at,?),updated_at=? where id=?", (now_iso(), now_iso(), job_id))
    return get_autopilot_job(job_id)


def autopilot_package_zip(job_id: str) -> bytes:
    job = _job_payload(job_id)
    package = job.get("package")
    if not isinstance(package, dict) or job["status"] != "approved":
        raise ValueError("Autopilot package is not ready")
    metadata = package.get("metadata") if isinstance(package.get("metadata"), dict) else {}
    handoff = package.get("handoff") if isinstance(package.get("handoff"), dict) else {}
    script = package.get("script") if isinstance(package.get("script"), dict) else {}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("script.txt", str(script.get("narration") or ""))
        archive.writestr("captions.srt", str(handoff.get("captionsSrt") or ""))
        archive.writestr("storyboard.json", json.dumps(handoff.get("storyboard") or [], ensure_ascii=False, indent=2))
        archive.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))
        archive.writestr("asset-prompts.txt", "\n\n".join(str(item) for item in handoff.get("assetPrompts", [])))
        archive.writestr("capcut-brief.txt", str(handoff.get("capcutBrief") or ""))
        archive.writestr("canva-thumbnail-brief.txt", str(handoff.get("canvaBrief") or ""))
        archive.writestr("repurposing-plan.txt", str(handoff.get("repurposingPlan") or ""))
    return buffer.getvalue()


def autopilot_worker_loop() -> None:
    while not WORKER_STOP.is_set():
        with db_conn() as conn:
            row = conn.execute("select id from autopilot_jobs where status='queued' order by created_at limit 1").fetchone()
        if row:
            try:
                process_autopilot_job(str(row[0]))
            except Exception as exc:  # noqa: BLE001
                _set_job_attention(str(row[0]), "research", str(exc))
            continue
        AUTOPILOT_WAKE.wait(3.0)
        AUTOPILOT_WAKE.clear()


YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def _fernet() -> Any:
    key = os.environ.get("CREATOR_EMPIRE_TOKEN_KEY", "").strip()
    if not key:
        raise RuntimeError("CREATOR_EMPIRE_TOKEN_KEY is required for encrypted OAuth storage")
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode("ascii"))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("A valid Fernet CREATOR_EMPIRE_TOKEN_KEY and cryptography package are required") from exc


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode("ascii")).decode("utf-8")


def _youtube_config() -> dict[str, str]:
    config = {
        "clientId": os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip(),
        "clientSecret": os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip(),
        "redirectUri": os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "https://creator.flowbiz.cloud/api/youtube/oauth/callback").strip(),
    }
    if not config["clientId"] or not config["clientSecret"]:
        raise RuntimeError("Google OAuth Web Client credentials are not configured")
    _fernet()
    return config


def youtube_status() -> dict[str, Any]:
    configured = bool(os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip() and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip() and os.environ.get("CREATOR_EMPIRE_TOKEN_KEY", "").strip())
    with db_conn() as conn:
        connected = conn.execute("select 1 from youtube_connections where id='default'").fetchone() is not None
        latest = conn.execute("select id,status,progress,video_id,video_url,error,updated_at from youtube_uploads order by created_at desc limit 1").fetchone()
    upload = None if not latest else {"id": latest[0], "status": latest[1], "progress": int(latest[2]), "videoId": latest[3], "videoUrl": latest[4], "error": latest[5], "updatedAt": latest[6]}
    return {"ok": True, "configured": configured, "connected": connected, "scope": YOUTUBE_UPLOAD_SCOPE, "privacyStatus": "private", "latestUpload": upload}


def youtube_oauth_url(return_to: str = "/#/beta/create") -> str:
    config = _youtube_config()
    safe_return = return_to if return_to.startswith("/#/") else "/#/beta/create"
    state = secrets.token_urlsafe(32)
    OAUTH_STATES[state] = (time.time() + 600, safe_return)
    params = {
        "client_id": config["clientId"], "redirect_uri": config["redirectUri"], "response_type": "code",
        "scope": YOUTUBE_UPLOAD_SCOPE, "access_type": "offline", "include_granted_scopes": "true",
        "prompt": "consent", "state": state,
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)


def _post_form(url: str, payload: dict[str, str], timeout: float = 30) -> dict[str, Any]:
    data = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            parsed = json.loads(response.read().decode("utf-8"))
            return parsed if isinstance(parsed, dict) else {}
    except urllib.error.HTTPError as exc:
        exc.read()
        raise RuntimeError(f"OAuth provider rejected the request with HTTP {exc.code}") from exc


def complete_youtube_oauth(code: str, state: str) -> str:
    saved = OAUTH_STATES.pop(state, None)
    if not saved or saved[0] < time.time():
        raise PermissionError("Invalid or expired OAuth state")
    if not code:
        raise ValueError("OAuth authorization code is missing")
    config = _youtube_config()
    token = _post_form("https://oauth2.googleapis.com/token", {
        "code": code, "client_id": config["clientId"], "client_secret": config["clientSecret"],
        "redirect_uri": config["redirectUri"], "grant_type": "authorization_code",
    })
    if not token.get("access_token"):
        raise RuntimeError("Google OAuth did not return an access token")
    token["expires_at"] = time.time() + float(token.get("expires_in") or 3600)
    if not token.get("refresh_token"):
        with db_conn() as conn:
            old = conn.execute("select encrypted_token_json from youtube_connections where id='default'").fetchone()
        if old:
            previous = _json_object(decrypt_secret(str(old[0])))
            token["refresh_token"] = previous.get("refresh_token")
    if not token.get("refresh_token"):
        raise RuntimeError("Google OAuth did not return an offline refresh token; reconnect with consent")
    encrypted = encrypt_secret(canonical_json(token))
    with db_conn() as conn:
        conn.execute(
            "insert into youtube_connections(id,encrypted_token_json,scope,created_at,updated_at) values('default',?,?,?,?) "
            "on conflict(id) do update set encrypted_token_json=excluded.encrypted_token_json,scope=excluded.scope,updated_at=excluded.updated_at",
            (encrypted, YOUTUBE_UPLOAD_SCOPE, now_iso(), now_iso()),
        )
    return saved[1]


def _youtube_access_token(force_refresh: bool = False) -> str:
    config = _youtube_config()
    with db_conn() as conn:
        row = conn.execute("select encrypted_token_json from youtube_connections where id='default'").fetchone()
    if not row:
        raise RuntimeError("YouTube is not connected")
    token = _json_object(decrypt_secret(str(row[0])))
    if not force_refresh and float(token.get("expires_at") or 0) > time.time() + 60 and token.get("access_token"):
        return str(token["access_token"])
    refresh = str(token.get("refresh_token") or "")
    if not refresh:
        raise RuntimeError("YouTube refresh token is unavailable; reconnect the account")
    refreshed = _post_form("https://oauth2.googleapis.com/token", {
        "client_id": config["clientId"], "client_secret": config["clientSecret"],
        "refresh_token": refresh, "grant_type": "refresh_token",
    })
    if not refreshed.get("access_token"):
        raise RuntimeError("Google did not refresh the YouTube access token")
    token.update(refreshed)
    token["refresh_token"] = refresh
    token["expires_at"] = time.time() + float(refreshed.get("expires_in") or 3600)
    with db_conn() as conn:
        conn.execute("update youtube_connections set encrypted_token_json=?,updated_at=? where id='default'", (encrypt_secret(canonical_json(token)), now_iso()))
    return str(token["access_token"])


def disconnect_youtube() -> dict[str, Any]:
    with db_conn() as conn:
        row = conn.execute("select encrypted_token_json from youtube_connections where id='default'").fetchone()
        conn.execute("delete from youtube_connections where id='default'")
    if row:
        try:
            token = _json_object(decrypt_secret(str(row[0])))
            revoke = str(token.get("refresh_token") or token.get("access_token") or "")
            if revoke:
                _post_form("https://oauth2.googleapis.com/revoke", {"token": revoke}, 10)
        except Exception:
            pass
    return youtube_status()


def _cleanup_video_assets() -> None:
    now = now_iso()
    with db_conn() as conn:
        rows = conn.execute("select id,stored_path from video_assets where status='ready' and expires_at<?", (now,)).fetchall()
        for asset_id, stored_path in rows:
            Path(str(stored_path)).unlink(missing_ok=True)
            conn.execute("update video_assets set status='expired' where id=?", (asset_id,))


def receive_video_asset(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    _cleanup_video_assets()
    length = int(handler.headers.get("Content-Length", "0") or 0)
    if length <= 0:
        raise ValueError("Video file is empty")
    if length > MAX_VIDEO_BYTES:
        raise ValueError("Video exceeds the configured upload limit")
    content_type = handler.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    encoded_name = handler.headers.get("X-Filename", "video.mp4")
    filename = Path(urllib.parse.unquote(encoded_name)).name
    if content_type not in {"video/mp4", "application/octet-stream"} or not filename.lower().endswith(".mp4"):
        raise ValueError("Only MP4 video assets are accepted")
    VIDEO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    asset_id = f"asset_{uuid.uuid4().hex}"
    target = (VIDEO_UPLOAD_DIR / f"{asset_id}.mp4").resolve()
    if VIDEO_UPLOAD_DIR.resolve() not in target.parents:
        raise ValueError("Invalid upload path")
    digest = hashlib.sha256()
    remaining = length
    try:
        with target.open("xb") as stream:
            while remaining:
                chunk = handler.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError("Video upload ended before Content-Length")
                stream.write(chunk)
                digest.update(chunk)
                remaining -= len(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    created = now_iso()
    expires = (datetime.now(timezone.utc) + timedelta(hours=24)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    project_id = handler.headers.get("X-Project-Id", "").strip()[:120] or None
    with db_conn() as conn:
        conn.execute(
            "insert into video_assets(id,project_id,filename,stored_path,content_type,size_bytes,sha256,status,created_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
            (asset_id, project_id, filename, str(target), "video/mp4", length, digest.hexdigest(), "ready", created, expires),
        )
    return {"ok": True, "asset": {"id": asset_id, "projectId": project_id, "filename": filename, "contentType": "video/mp4", "sizeBytes": length, "sha256": digest.hexdigest(), "status": "ready", "createdAt": created, "expiresAt": expires}}


def create_youtube_upload(payload: dict[str, Any]) -> dict[str, Any]:
    asset_id = str(payload.get("assetId") or "").strip()
    with db_conn() as conn:
        asset = conn.execute("select status from video_assets where id=?", (asset_id,)).fetchone()
    if not asset or asset[0] != "ready":
        raise ValueError("A ready video asset is required")
    if not youtube_status()["connected"]:
        raise RuntimeError("Connect YouTube before uploading")
    raw = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    metadata = {
        "title": str(raw.get("title") or "Creator Empire video")[:100],
        "description": str(raw.get("description") or "")[:5000],
        "tags": [str(item)[:500] for item in raw.get("tags", []) if isinstance(item, str)][:30],
        "categoryId": str(raw.get("categoryId") or "22"),
        "containsSyntheticMedia": bool(raw.get("containsSyntheticMedia", True)),
        "privacyStatus": "private",
    }
    upload_id = f"yt_{uuid.uuid4().hex}"
    created = now_iso()
    with db_conn() as conn:
        conn.execute(
            "insert into youtube_uploads(id,asset_id,status,progress,metadata_json,created_at,updated_at) values(?,?, 'queued',0,?,?,?)",
            (upload_id, asset_id, canonical_json(metadata), created, created),
        )
    YOUTUBE_WAKE.set()
    return get_youtube_upload(upload_id)


def get_youtube_upload(upload_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        row = conn.execute("select id,asset_id,status,progress,video_id,video_url,error,created_at,updated_at from youtube_uploads where id=?", (upload_id,)).fetchone()
    if not row:
        raise KeyError("YouTube upload not found")
    return {"ok": True, "upload": {"id": row[0], "assetId": row[1], "status": row[2], "progress": int(row[3]), "videoId": row[4], "videoUrl": row[5], "error": row[6], "createdAt": row[7], "updatedAt": row[8]}}


def _initiate_youtube_session(access_token: str, metadata: dict[str, Any], size: int) -> str:
    body = json.dumps({
        "snippet": {"title": metadata["title"], "description": metadata["description"], "tags": metadata["tags"], "categoryId": metadata["categoryId"], "defaultLanguage": "th"},
        "status": {"privacyStatus": "private", "selfDeclaredMadeForKids": False, "containsSyntheticMedia": metadata["containsSyntheticMedia"]},
    }, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        data=body, method="POST", headers={
            "Authorization": f"Bearer {access_token}", "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": str(size), "X-Upload-Content-Type": "video/mp4",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            location = response.headers.get("Location", "")
    except urllib.error.HTTPError as exc:
        exc.read()
        raise RuntimeError(f"YouTube upload session rejected with HTTP {exc.code}") from exc
    if not location.startswith("https://www.googleapis.com/"):
        raise RuntimeError("YouTube resumable upload session URI is missing")
    return location


def process_youtube_upload(upload_id: str) -> None:
    with db_conn() as conn:
        row = conn.execute(
            "select u.asset_id,u.metadata_json,u.encrypted_session_uri,u.uploaded_bytes,a.stored_path,a.size_bytes,a.content_type "
            "from youtube_uploads u join video_assets a on a.id=u.asset_id where u.id=?", (upload_id,)
        ).fetchone()
    if not row:
        raise KeyError("YouTube upload not found")
    asset_id, metadata_json, encrypted_session, uploaded_bytes, stored_path, size_bytes, content_type = row
    path = Path(str(stored_path))
    if not path.is_file():
        raise RuntimeError("Temporary video asset is unavailable")
    with db_conn() as conn:
        conn.execute("update youtube_uploads set status='uploading',error=null,updated_at=? where id=?", (now_iso(), upload_id))
        conn.execute("update video_assets set status='uploading' where id=?", (asset_id,))
    try:
        access_token = _youtube_access_token()
        metadata = _json_object(str(metadata_json))
        session_uri = decrypt_secret(str(encrypted_session)) if encrypted_session else _initiate_youtube_session(access_token, metadata, int(size_bytes))
        if not encrypted_session:
            with db_conn() as conn:
                conn.execute("update youtube_uploads set encrypted_session_uri=?,updated_at=? where id=?", (encrypt_secret(session_uri), now_iso(), upload_id))
        offset = int(uploaded_bytes or 0)
        chunk_size = 8 * 1024 * 1024
        with path.open("rb") as stream:
            stream.seek(offset)
            while offset < int(size_bytes):
                chunk = stream.read(min(chunk_size, int(size_bytes) - offset))
                if not chunk:
                    raise RuntimeError("Video asset ended unexpectedly")
                end = offset + len(chunk) - 1
                request = urllib.request.Request(session_uri, data=chunk, method="PUT", headers={
                    "Authorization": f"Bearer {access_token}", "Content-Type": str(content_type),
                    "Content-Length": str(len(chunk)), "Content-Range": f"bytes {offset}-{end}/{size_bytes}",
                })
                response_payload: dict[str, Any] = {}
                for attempt in range(3):
                    try:
                        with urllib.request.urlopen(request, timeout=300) as response:
                            response_payload = _json_object(response.read().decode("utf-8"))
                        offset = end + 1
                        break
                    except urllib.error.HTTPError as exc:
                        if exc.code == 308:
                            range_header = exc.headers.get("Range", "") if exc.headers else ""
                            offset = int(range_header.rsplit("-", 1)[-1]) + 1 if "-" in range_header else end + 1
                            exc.read()
                            break
                        exc.read()
                        if exc.code == 401 and attempt == 0:
                            access_token = _youtube_access_token(True)
                            request.add_header("Authorization", f"Bearer {access_token}")
                            continue
                        if exc.code in {500, 502, 503, 504} and attempt < 2:
                            time.sleep(2**attempt)
                            continue
                        raise RuntimeError(f"YouTube upload failed with HTTP {exc.code}") from exc
                progress = min(99, int(offset * 100 / int(size_bytes)))
                with db_conn() as conn:
                    conn.execute("update youtube_uploads set uploaded_bytes=?,progress=?,updated_at=? where id=?", (offset, progress, now_iso(), upload_id))
                if response_payload.get("id"):
                    video_id = str(response_payload["id"])
                    video_url = f"https://www.youtube.com/watch?v={video_id}"
                    with db_conn() as conn:
                        conn.execute("update youtube_uploads set status='uploaded',progress=100,video_id=?,video_url=?,updated_at=? where id=?", (video_id, video_url, now_iso(), upload_id))
                        conn.execute("update video_assets set status='uploaded' where id=?", (asset_id,))
                    path.unlink(missing_ok=True)
                    return
        raise RuntimeError("YouTube did not return a video ID after upload")
    except Exception as exc:  # noqa: BLE001
        with db_conn() as conn:
            conn.execute("update youtube_uploads set status='needs_attention',error=?,updated_at=? where id=?", (str(exc)[:300], now_iso(), upload_id))
            conn.execute("update video_assets set status='ready' where id=?", (asset_id,))


def retry_youtube_upload(upload_id: str) -> dict[str, Any]:
    current = get_youtube_upload(upload_id)["upload"]
    if current["status"] != "needs_attention":
        raise ValueError("Only failed YouTube uploads can be retried")
    with db_conn() as conn:
        conn.execute("update youtube_uploads set status='queued',error=null,updated_at=? where id=?", (now_iso(), upload_id))
    YOUTUBE_WAKE.set()
    return get_youtube_upload(upload_id)


def youtube_worker_loop() -> None:
    while not WORKER_STOP.is_set():
        with db_conn() as conn:
            row = conn.execute("select id from youtube_uploads where status='queued' order by created_at limit 1").fetchone()
        if row:
            process_youtube_upload(str(row[0]))
            continue
        YOUTUBE_WAKE.wait(3.0)
        YOUTUBE_WAKE.clear()


def recover_interrupted_jobs() -> None:
    """Requeue only resumable background work after an unclean service stop."""
    with db_conn() as conn:
        conn.execute("update autopilot_jobs set status='queued',updated_at=? where status='running'", (now_iso(),))
        conn.execute("update youtube_uploads set status='queued',updated_at=? where status='uploading'", (now_iso(),))


def ai_runs() -> dict[str, Any]:
    with db_conn() as conn:
        rows = conn.execute(
            "select id,provider,model,created_at,input_tokens,output_tokens,search_queries,estimated_cost_usd,ok,error "
            "from ai_runs order by id desc limit 100"
        ).fetchall()
    return {
        "runs": [
            {
                "id": row[0], "provider": row[1], "model": row[2], "createdAt": row[3],
                "inputTokens": row[4], "outputTokens": row[5], "searchQueries": row[6], "estimatedCostUsd": row[7],
                "ok": bool(row[8]), "error": row[9],
            }
            for row in rows
        ],
        "dailySpendUsd": round(ai_spend("day"), 6),
        "monthlySpendUsd": round(ai_spend("month"), 6),
    }


def ai_capabilities() -> dict[str, Any]:
    settings = load_settings()
    daily, monthly = budget_limits(settings)
    return {
        "ok": True,
        "promptTypes": list(SUPPORTED_PROMPT_TYPES),
        "structuredOutput": {"gemini": True, "openai": True},
        "openAiRouter": {
            "defaultModel": str(settings.get("openAiModel") or OPENAI_DEFAULT_MODEL),
            "advancedModel": str(settings.get("openAiAdvancedModel") or OPENAI_ADVANCED_MODEL),
            "advancedPromptTypes": sorted(OPENAI_ADVANCED_PROMPT_TYPES),
            "defaultSharePercent": 81.25,
            "advancedSharePercent": 18.75,
            "importantScriptOverride": True,
        },
        "searchGrounding": {"openai": sorted(RESEARCH_PROMPT_TYPES), "gemini": sorted(RESEARCH_PROMPT_TYPES)},
        "guardrails": {
            "promptCharacterLimit": 100_000,
            "maxOutputTokens": int(numeric_setting(settings, "aiMaxOutputTokens", 2500, 128, 16000)),
            "dailyBudgetUsd": daily,
            "monthlyBudgetUsd": monthly,
            "serializedBudgetChecks": True,
            "geminiThinkingLevel": str(settings.get("geminiThinkingLevel") or "low"),
            "keysPersistedInDatabase": False,
        },
    }


class CreatorHandler(BaseHTTPRequestHandler):
    server_version = "CreatorEmpireSQLite/1.5.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    @property
    def web_root(self) -> Path:
        return self.server.web_root  # type: ignore[attr-defined]

    def do_GET(self) -> None:  # noqa: N802
        try:
            parsed_url = urllib.parse.urlparse(self.path)
            path = parsed_url.path
            if path == "/api/health":
                json_response(self, 200, {
                    "ok": True,
                    "service": "creator-empire",
                    "version": "1.5.0",
                    "release": os.environ.get("CREATOR_EMPIRE_RELEASE_SHA", "dev"),
                }); return
            if path == "/api/workspace":
                json_response(self, 200, load_workspace()); return
            if path == "/api/workspace/history":
                json_response(self, 200, list_history()); return
            if path == "/api/storage":
                json_response(self, 200, {"ok": True, "storage": db_storage_meta(), "secrets": secret_status()["providers"]}); return
            if path == "/api/secrets":
                json_response(self, 200, secret_status()); return
            if path == "/api/ai/runs":
                json_response(self, 200, ai_runs()); return
            if path == "/api/ai/capabilities":
                json_response(self, 200, ai_capabilities()); return
            if path == "/api/youtube/status":
                json_response(self, 200, youtube_status()); return
            if path == "/api/youtube/oauth/start":
                query = urllib.parse.parse_qs(parsed_url.query)
                redirect_response(self, youtube_oauth_url(query.get("returnTo", ["/#/beta/create"])[0])); return
            if path == "/api/youtube/oauth/callback":
                query = urllib.parse.parse_qs(parsed_url.query)
                return_to = complete_youtube_oauth(query.get("code", [""])[0], query.get("state", [""])[0])
                redirect_response(self, return_to + ("&" if "?" in return_to else "?") + "youtube=connected"); return
            if path.startswith("/api/youtube/uploads/"):
                json_response(self, 200, get_youtube_upload(path.rsplit("/", 1)[-1])); return
            if path == "/api/autopilot/jobs":
                query = urllib.parse.parse_qs(parsed_url.query)
                json_response(self, 200, list_autopilot_jobs(int(query.get("limit", [20])[0]))); return
            if path.startswith("/api/autopilot/jobs/"):
                suffix = path[len("/api/autopilot/jobs/"):]
                if suffix.endswith("/package.zip"):
                    job_id = suffix[:-len("/package.zip")]
                    binary_response(self, 200, autopilot_package_zip(job_id), "application/zip", f"creator-empire-{job_id}.zip"); return
                json_response(self, 200, get_autopilot_job(suffix)); return
            self.serve_static()
        except KeyError as exc:
            json_response(self, 404, {"ok": False, "error": str(exc)[:300]})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 500, {"ok": False, "error": str(exc)[:300]})

    def do_HEAD(self) -> None:  # noqa: N802
        try:
            path = urllib.parse.urlparse(self.path).path
            if path.startswith("/api/"):
                self.send_response(405)
                self.send_header("Allow", "GET")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            self.serve_static(head_only=True)
        except Exception:
            self.send_response(500)
            self.end_headers()

    def do_PUT(self) -> None:  # noqa: N802
        try:
            validate_request_origin(self)
            if urllib.parse.urlparse(self.path).path == "/api/workspace":
                json_response(self, 200, save_workspace(read_json(self))); return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)[:300]})

    def do_POST(self) -> None:  # noqa: N802
        try:
            validate_request_origin(self)
            path = urllib.parse.urlparse(self.path).path
            if path == "/api/video-assets":
                json_response(self, 201, receive_video_asset(self)); return
            if path == "/api/youtube/uploads":
                json_response(self, 202, create_youtube_upload(read_json(self))); return
            if path.startswith("/api/youtube/uploads/") and path.endswith("/retry"):
                upload_id = path[len("/api/youtube/uploads/"):-len("/retry")]
                json_response(self, 202, retry_youtube_upload(upload_id)); return
            if path == "/api/autopilot/jobs":
                json_response(self, 202, create_autopilot_job(read_json(self))); return
            if path.startswith("/api/autopilot/jobs/"):
                suffix = path[len("/api/autopilot/jobs/"):]
                job_id, _, action = suffix.partition("/")
                if action == "approve": json_response(self, 200, approve_autopilot_job(job_id)); return
                if action == "retry": json_response(self, 202, retry_autopilot_job(job_id)); return
                if action == "cancel": json_response(self, 200, cancel_autopilot_job(job_id)); return
            payload = read_json(self)
            if path == "/api/secrets":
                json_response(self, 200, save_session_secret(payload)); return
            if path == "/api/ai/generate":
                json_response(self, 200, ai_generate(payload)); return
            if path == "/api/recovery/restore":
                json_response(self, 200, restore_revision(payload)); return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)[:300]})

    def do_DELETE(self) -> None:  # noqa: N802
        try:
            validate_request_origin(self)
            path = urllib.parse.urlparse(self.path).path
            if path == "/api/youtube/connection":
                json_response(self, 200, disconnect_youtube()); return
            if path.startswith("/api/secrets/"):
                provider = path.rsplit("/", 1)[-1]
                json_response(self, 200, delete_session_secret(provider)); return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)[:300]})

    def serve_static(self, head_only: bool = False) -> None:
        request_path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path).lstrip("/") or "index.html"
        root_resolved = self.web_root.resolve()
        candidate = (root_resolved / request_path).resolve()
        try:
            candidate.relative_to(root_resolved)
        except ValueError:
            candidate = root_resolved / "index.html"
        if not candidate.exists() or candidate.is_dir():
            candidate = root_resolved / "index.html"
        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        if candidate.suffix in {".js", ".css", ".html", ".json", ".svg", ".webmanifest"}:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)


def main() -> None:
    global AUTOPILOT_THREAD, YOUTUBE_THREAD
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="dist")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=4173, type=int)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"} and os.environ.get("CREATOR_EMPIRE_ALLOW_REMOTE") != "1":
        raise SystemExit("Remote binding is disabled by default. Set CREATOR_EMPIRE_ALLOW_REMOTE=1 only if you understand the risk.")
    ensure_db()
    recover_interrupted_jobs()
    AUTOPILOT_THREAD = threading.Thread(target=autopilot_worker_loop, name="creator-autopilot", daemon=True)
    AUTOPILOT_THREAD.start()
    YOUTUBE_THREAD = threading.Thread(target=youtube_worker_loop, name="creator-youtube", daemon=True)
    YOUTUBE_THREAD.start()
    web_root = (ROOT / args.root).resolve()
    server = ThreadingHTTPServer((args.host, args.port), CreatorHandler)
    server.web_root = web_root  # type: ignore[attr-defined]
    print(f"Creator Empire Simulator v1.5: http://{args.host}:{args.port}")
    print(f"SQLite database: {DB_PATH}")
    print("Secrets: environment variables or session-only memory; never SQLite")
    try:
        server.serve_forever()
    finally:
        WORKER_STOP.set()
        AUTOPILOT_WAKE.set()
        YOUTUBE_WAKE.set()


if __name__ == "__main__":
    main()
