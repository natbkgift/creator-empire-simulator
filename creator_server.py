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
    DATA_DIR.mkdir(parents=True, exist_ok=True)
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
          estimated_cost_usd real not null default 0,
          ok integer not null,
          error text
        )
        """)
        for name, decl in (
            ("input_tokens", "integer not null default 0"),
            ("output_tokens", "integer not null default 0"),
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


def provider_rates(provider: str, settings: dict[str, Any]) -> tuple[float, float]:
    prefix = "openAi" if provider == "openai" else "gemini"
    return (
        numeric_setting(settings, f"{prefix}InputUsdPer1M", 0, 0, 1000),
        numeric_setting(settings, f"{prefix}OutputUsdPer1M", 0, 0, 1000),
    )


def estimate_cost(provider: str, input_tokens: int, output_tokens: int, settings: dict[str, Any]) -> float:
    input_rate, output_rate = provider_rates(provider, settings)
    return (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000


def enforce_budget(provider: str, settings: dict[str, Any]) -> None:
    daily = numeric_setting(settings, "aiDailyBudgetUsd", 2.0, 0, 10_000)
    monthly = numeric_setting(settings, "aiMonthlyBudgetUsd", 20.0, 0, 100_000)
    input_rate, output_rate = provider_rates(provider, settings)
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
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = RuntimeError(f"Network error: {type(exc).__name__}")
            if attempt == attempts - 1:
                raise last_error from exc
        time.sleep(0.5 * (2**attempt))
    raise last_error or RuntimeError("AI request failed")


def call_openai(prompt: str, model: str, api_key: str, max_output_tokens: int, timeout: float) -> tuple[str, int, int]:
    data = post_json(
        "https://api.openai.com/v1/responses",
        {"Authorization": f"Bearer {api_key}"},
        {"model": model, "input": prompt, "store": False, "max_output_tokens": max_output_tokens},
        timeout,
    )
    chunks: list[str] = []
    if isinstance(data.get("output_text"), str):
        chunks.append(data["output_text"])
    for item in data.get("output", []) if isinstance(data.get("output"), list) else []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    return (
        "\n".join(dict.fromkeys(filter(None, chunks))).strip() or json.dumps(data, ensure_ascii=False),
        int(usage.get("input_tokens", 0) or 0),
        int(usage.get("output_tokens", 0) or 0),
    )


def call_gemini(prompt: str, model: str, api_key: str, max_output_tokens: int, timeout: float) -> tuple[str, int, int]:
    encoded_model = urllib.parse.quote(model, safe="")
    data = post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{encoded_model}:generateContent",
        {"x-goog-api-key": api_key},
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": max_output_tokens},
        },
        timeout,
    )
    parts: list[str] = []
    for candidate in data.get("candidates", []) if isinstance(data.get("candidates"), list) else []:
        content = candidate.get("content", {}) if isinstance(candidate, dict) else {}
        for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
    usage = data.get("usageMetadata") if isinstance(data.get("usageMetadata"), dict) else {}
    return (
        "\n".join(parts).strip() or json.dumps(data, ensure_ascii=False),
        int(usage.get("promptTokenCount", 0) or 0),
        int(usage.get("candidatesTokenCount", 0) or 0),
    )


def ai_generate(payload: dict[str, Any]) -> dict[str, Any]:
    provider = str(payload.get("provider") or "openai").strip().lower()
    if provider not in {"openai", "gemini"}:
        raise ValueError("provider must be openai or gemini")
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    settings = load_settings()
    enforce_budget(provider, settings)
    api_key, key_source = provider_key(provider)
    default_model = str(settings.get("openAiModel" if provider == "openai" else "geminiModel") or "").strip()
    model = str(payload.get("model") or default_model).strip()
    if not model:
        raise ValueError("model is required")
    max_tokens = int(numeric_setting(settings, "aiMaxOutputTokens", 2500, 128, 16000))
    requested_tokens = int(payload.get("maxOutputTokens", max_tokens) or max_tokens)
    max_tokens = min(max_tokens, max(128, requested_tokens))
    timeout = numeric_setting(settings, "aiRequestTimeoutSeconds", 60, 10, 180)
    ok = 0
    error: str | None = None
    text = ""
    input_tokens = 0
    output_tokens = 0
    estimated_cost = 0.0
    try:
        if provider == "openai":
            text, input_tokens, output_tokens = call_openai(prompt, model, api_key, max_tokens, timeout)
        else:
            text, input_tokens, output_tokens = call_gemini(prompt, model, api_key, max_tokens, timeout)
        estimated_cost = estimate_cost(provider, input_tokens, output_tokens, settings)
        daily = numeric_setting(settings, "aiDailyBudgetUsd", 2.0, 0, 10_000)
        monthly = numeric_setting(settings, "aiMonthlyBudgetUsd", 20.0, 0, 100_000)
        if daily and ai_spend("day") + estimated_cost > daily:
            raise RuntimeError("This run would exceed the daily AI budget")
        if monthly and ai_spend("month") + estimated_cost > monthly:
            raise RuntimeError("This run would exceed the monthly AI budget")
        ok = 1
        return {
            "ok": True,
            "provider": provider,
            "model": model,
            "text": text,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
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
                "insert into ai_runs(provider,model,created_at,prompt_chars,response_chars,input_tokens,output_tokens,estimated_cost_usd,ok,error) "
                "values(?,?,?,?,?,?,?,?,?,?)",
                (provider, model, now_iso(), len(prompt), len(text), input_tokens, output_tokens, estimated_cost, ok, error),
            )


def ai_runs() -> dict[str, Any]:
    with db_conn() as conn:
        rows = conn.execute(
            "select id,provider,model,created_at,input_tokens,output_tokens,estimated_cost_usd,ok,error "
            "from ai_runs order by id desc limit 100"
        ).fetchall()
    return {
        "runs": [
            {
                "id": row[0], "provider": row[1], "model": row[2], "createdAt": row[3],
                "inputTokens": row[4], "outputTokens": row[5], "estimatedCostUsd": row[6],
                "ok": bool(row[7]), "error": row[8],
            }
            for row in rows
        ],
        "dailySpendUsd": round(ai_spend("day"), 6),
        "monthlySpendUsd": round(ai_spend("month"), 6),
    }


class CreatorHandler(BaseHTTPRequestHandler):
    server_version = "CreatorEmpireSQLite/1.3"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    @property
    def web_root(self) -> Path:
        return self.server.web_root  # type: ignore[attr-defined]

    def do_GET(self) -> None:  # noqa: N802
        try:
            path = urllib.parse.urlparse(self.path).path
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
            self.serve_static()
        except Exception as exc:  # noqa: BLE001
            json_response(self, 500, {"ok": False, "error": str(exc)[:300]})

    def do_PUT(self) -> None:  # noqa: N802
        try:
            if urllib.parse.urlparse(self.path).path == "/api/workspace":
                json_response(self, 200, save_workspace(read_json(self))); return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)[:300]})

    def do_POST(self) -> None:  # noqa: N802
        try:
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
            path = urllib.parse.urlparse(self.path).path
            if path.startswith("/api/secrets/"):
                provider = path.rsplit("/", 1)[-1]
                json_response(self, 200, delete_session_secret(provider)); return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)[:300]})

    def serve_static(self) -> None:
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
        self.end_headers()
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
