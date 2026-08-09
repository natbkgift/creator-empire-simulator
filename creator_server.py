#!/usr/bin/env python3
"""Creator Empire Simulator local server v1.3.

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
import json
import mimetypes
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.environ.get("CREATOR_EMPIRE_DB", DATA_DIR / "creator_empire.sqlite"))
SESSION_KEYS: dict[str, str] = {}
MAX_HISTORY = 80
AI_RUN_LOCK = threading.Lock()
SUPPORTED_PROMPT_TYPES = (
    "niche-research", "topic-research", "fact-check", "competitor-pattern", "hook-generator",
    "shorts-script", "long-script", "storyboard", "capcut-standard", "capcut-director",
    "ai-image", "ai-video", "thumbnail-title", "repurposing", "analytics-postmortem", "next-video",
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


def post_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: float, attempts: int = 4) -> dict[str, Any]:
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
    data = post_json(
        "https://api.openai.com/v1/responses",
        {"Authorization": f"Bearer {api_key}"},
        request_payload,
        timeout,
    )
    if data.get("status") == "incomplete":
        details = data.get("incomplete_details") if isinstance(data.get("incomplete_details"), dict) else {}
        reason = str(details.get("reason") or "unknown")[:80]
        raise RuntimeError(f"OpenAI response incomplete: {reason}")
    chunks: list[str] = []
    search_queries = 0
    if isinstance(data.get("output_text"), str):
        chunks.append(data["output_text"])
    for item in data.get("output", []) if isinstance(data.get("output"), list) else []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "web_search_call":
            search_queries += 1
        for content in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if isinstance(content, dict) and content.get("type") == "refusal":
                raise RuntimeError("OpenAI declined this request")
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    text = "\n".join(dict.fromkeys(filter(None, chunks))).strip()
    if not text:
        raise RuntimeError("OpenAI response unavailable: provider returned no text")
    try:
        json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("OpenAI produced invalid structured JSON") from exc
    return (
        text,
        int(usage.get("input_tokens", 0) or 0),
        int(usage.get("output_tokens", 0) or 0),
        search_queries,
    )


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
        "fact-check": ("safeSummary", {"safeSummary": string, "claims": object_array({"claim": string, "status": string, "evidence": string, "caveat": string}, ["claim", "status"], 3), "blockingIssues": strings, "sources": sources}),
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
    server_version = "CreatorEmpireSQLite/1.4.5"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    @property
    def web_root(self) -> Path:
        return self.server.web_root  # type: ignore[attr-defined]

    def do_GET(self) -> None:  # noqa: N802
        try:
            path = urllib.parse.urlparse(self.path).path
            if path == "/api/health":
                json_response(self, 200, {
                    "ok": True,
                    "service": "creator-empire",
                    "version": "1.4.5",
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
            self.serve_static()
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="dist")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=4173, type=int)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"} and os.environ.get("CREATOR_EMPIRE_ALLOW_REMOTE") != "1":
        raise SystemExit("Remote binding is disabled by default. Set CREATOR_EMPIRE_ALLOW_REMOTE=1 only if you understand the risk.")
    ensure_db()
    web_root = (ROOT / args.root).resolve()
    server = ThreadingHTTPServer((args.host, args.port), CreatorHandler)
    server.web_root = web_root  # type: ignore[attr-defined]
    print(f"Creator Empire Simulator v1.3: http://{args.host}:{args.port}")
    print(f"SQLite database: {DB_PATH}")
    print("Secrets: environment variables or session-only memory; never SQLite")
    server.serve_forever()


if __name__ == "__main__":
    main()
