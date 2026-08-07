#!/usr/bin/env python3
"""Creator Empire Simulator local server.

Serves the built web app and stores workspace/secrets in a local SQLite database.
Secrets are never returned to the browser; only masked status is returned.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.environ.get("CREATOR_EMPIRE_DB", DATA_DIR / "creator_empire.sqlite"))


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def ensure_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("pragma journal_mode=wal")
        conn.execute("""
        create table if not exists workspace (
          id text primary key,
          data text not null,
          schema_version integer not null,
          updated_at text not null
        )
        """)
        conn.execute("""
        create table if not exists ai_secrets (
          provider text primary key,
          api_key text not null,
          model text not null,
          updated_at text not null
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
          ok integer not null,
          error text
        )
        """)


def mask_key(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 10:
        return value[:2] + "…" + value[-2:]
    return value[:6] + "…" + value[-4:]


def db_storage_meta() -> dict[str, Any]:
    updated_at = None
    try:
        with sqlite3.connect(DB_PATH) as conn:
            row = conn.execute("select updated_at from workspace where id='default'").fetchone()
            if row:
                updated_at = row[0]
    except sqlite3.Error:
        pass
    return {"dbPath": str(DB_PATH), "savedAt": updated_at}


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-cache")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("content-length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def save_workspace(payload: dict[str, Any]) -> dict[str, Any]:
    workspace = payload.get("workspace")
    if not isinstance(workspace, dict):
        raise ValueError("workspace must be an object")
    schema_version = int(workspace.get("schemaVersion", 0) or 0)
    updated_at = now_iso()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "insert into workspace(id, data, schema_version, updated_at) values(?,?,?,?) "
            "on conflict(id) do update set data=excluded.data, schema_version=excluded.schema_version, updated_at=excluded.updated_at",
            ("default", json.dumps(workspace, ensure_ascii=False), schema_version, updated_at),
        )
    return {"ok": True, "storage": db_storage_meta()}


def load_workspace() -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("select data from workspace where id='default'").fetchone()
    workspace = json.loads(row[0]) if row else None
    return {"workspace": workspace, "storage": db_storage_meta()}


def secret_status() -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("select provider, api_key, model, updated_at from ai_secrets").fetchall()
    configured = {
        row[0]: {"configured": True, "maskedKey": mask_key(row[1]), "model": row[2], "updatedAt": row[3]}
        for row in rows
    }
    for provider in ("openai", "gemini"):
        configured.setdefault(provider, {"configured": False, "maskedKey": "", "model": "", "updatedAt": ""})
    return {"providers": configured}


def save_secret(payload: dict[str, Any]) -> dict[str, Any]:
    provider = str(payload.get("provider", "")).strip().lower()
    api_key = str(payload.get("apiKey", "")).strip()
    model = str(payload.get("model", "")).strip()
    if provider not in {"openai", "gemini"}:
        raise ValueError("provider must be openai or gemini")
    if not api_key:
        raise ValueError("apiKey is required")
    if not model:
        model = "gpt-5.1" if provider == "openai" else "gemini-3.5-flash"
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "insert into ai_secrets(provider, api_key, model, updated_at) values(?,?,?,?) "
            "on conflict(provider) do update set api_key=excluded.api_key, model=excluded.model, updated_at=excluded.updated_at",
            (provider, api_key, model, now_iso()),
        )
    return secret_status()


def delete_secret(provider: str) -> dict[str, Any]:
    if provider not in {"openai", "gemini"}:
        raise ValueError("provider must be openai or gemini")
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("delete from ai_secrets where provider=?", (provider,))
    return secret_status()


def get_secret(provider: str) -> tuple[str, str]:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("select api_key, model from ai_secrets where provider=?", (provider,)).fetchone()
    if not row:
        raise ValueError(f"{provider} API key is not configured in local SQLite")
    return row[0], row[1]


def post_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
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
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body[:800]}") from exc


def call_openai(prompt: str, model: str, api_key: str) -> str:
    data = post_json(
        "https://api.openai.com/v1/responses",
        {"Authorization": f"Bearer {api_key}"},
        {"model": model, "input": prompt},
    )
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    chunks: list[str] = []
    for item in data.get("output", []) if isinstance(data.get("output"), list) else []:
        for content in item.get("content", []) if isinstance(item, dict) else []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks).strip() or json.dumps(data, ensure_ascii=False)


def call_gemini(prompt: str, model: str, api_key: str) -> str:
    # generateContent is intentionally used for a full response workflow. The newer Interactions
    # endpoint can be added later without changing the frontend contract.
    encoded_model = urllib.parse.quote(model, safe="")
    data = post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{encoded_model}:generateContent",
        {"x-goog-api-key": api_key},
        {"contents": [{"parts": [{"text": prompt}]}]},
    )
    parts: list[str] = []
    for candidate in data.get("candidates", []) if isinstance(data.get("candidates"), list) else []:
        content = candidate.get("content", {}) if isinstance(candidate, dict) else {}
        for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
    return "\n".join(parts).strip() or json.dumps(data, ensure_ascii=False)


def ai_generate(payload: dict[str, Any]) -> dict[str, Any]:
    provider = str(payload.get("provider") or "openai").strip().lower()
    if provider not in {"openai", "gemini"}:
        raise ValueError("provider must be openai or gemini")
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    api_key, default_model = get_secret(provider)
    model = str(payload.get("model") or default_model).strip() or default_model
    ok = 0
    error = None
    text = ""
    try:
        text = call_openai(prompt, model, api_key) if provider == "openai" else call_gemini(prompt, model, api_key)
        ok = 1
        return {"ok": True, "provider": provider, "model": model, "text": text, "createdAt": now_iso()}
    except Exception as exc:  # noqa: BLE001 - report sanitized local error to UI
        error = str(exc)
        raise
    finally:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "insert into ai_runs(provider, model, created_at, prompt_chars, response_chars, ok, error) values(?,?,?,?,?,?,?)",
                (provider, model, now_iso(), len(prompt), len(text), ok, error),
            )


class CreatorHandler(BaseHTTPRequestHandler):
    server_version = "CreatorEmpireSQLite/1.2"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    @property
    def web_root(self) -> Path:
        return self.server.web_root  # type: ignore[attr-defined]

    def do_GET(self) -> None:  # noqa: N802
        try:
            if self.path.startswith("/api/workspace"):
                json_response(self, 200, load_workspace())
                return
            if self.path.startswith("/api/storage"):
                json_response(self, 200, {"ok": True, "storage": db_storage_meta(), "secrets": secret_status()["providers"]})
                return
            if self.path.startswith("/api/secrets"):
                json_response(self, 200, secret_status())
                return
            self.serve_static()
        except Exception as exc:  # noqa: BLE001
            json_response(self, 500, {"ok": False, "error": str(exc)})

    def do_PUT(self) -> None:  # noqa: N802
        try:
            if self.path.startswith("/api/workspace"):
                json_response(self, 200, save_workspace(read_json(self)))
                return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)})

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = read_json(self)
            if self.path.startswith("/api/secrets"):
                json_response(self, 200, save_secret(payload))
                return
            if self.path.startswith("/api/ai/generate"):
                json_response(self, 200, ai_generate(payload))
                return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)})

    def do_DELETE(self) -> None:  # noqa: N802
        try:
            if self.path.startswith("/api/secrets/"):
                provider = self.path.rsplit("/", 1)[-1]
                json_response(self, 200, delete_secret(provider))
                return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, 400, {"ok": False, "error": str(exc)})

    def serve_static(self) -> None:
        request_path = urllib.parse.unquote(self.path.split("?", 1)[0]).lstrip("/") or "index.html"
        candidate = (self.web_root / request_path).resolve()
        root_resolved = self.web_root.resolve()
        if not str(candidate).startswith(str(root_resolved)) or not candidate.exists() or candidate.is_dir():
            candidate = root_resolved / "index.html"
        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        if candidate.suffix in {".js", ".css", ".html", ".json", ".svg"}:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="dist")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=4173, type=int)
    args = parser.parse_args()
    ensure_db()
    web_root = (ROOT / args.root).resolve()
    server = ThreadingHTTPServer((args.host, args.port), CreatorHandler)
    server.web_root = web_root  # type: ignore[attr-defined]
    print(f"Creator Empire Simulator v1.2 SQLite: http://{args.host}:{args.port}")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
