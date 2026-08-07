#!/usr/bin/env python3
"""Deterministic server/data-safety tests for Creator Empire v1.3."""
from __future__ import annotations

import inspect
import json
import sqlite3
import tempfile
from pathlib import Path

import creator_server as server


def assert_true(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def workspace(name: str, revision: int = 0) -> dict:
    return {
        "schemaVersion": 4,
        "revision": revision,
        "id": "default",
        "name": name,
        "updatedAt": server.now_iso(),
        "settings": {
            "openAiModel": "mock-openai",
            "geminiModel": "mock-gemini",
            "aiMaxOutputTokens": 500,
            "aiRequestTimeoutSeconds": 15,
            "aiDailyBudgetUsd": 10,
            "aiMonthlyBudgetUsd": 100,
            "openAiInputUsdPer1M": 1,
            "openAiOutputUsdPer1M": 2,
            "geminiInputUsdPer1M": 1,
            "geminiOutputUsdPer1M": 2,
        },
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="creator-empire-v13-") as temp:
        server.DB_PATH = Path(temp) / "creator_empire.sqlite"
        server.SESSION_KEYS.clear()

        # Simulate a v1.2 database that persisted a plaintext provider key.
        legacy_secret = "sk-legacy-plaintext-secret-must-be-purged"
        with sqlite3.connect(server.DB_PATH) as conn:
            conn.execute("create table ai_secrets(provider text primary key, api_key text not null, model text not null, updated_at text not null)")
            conn.execute("insert into ai_secrets values(?,?,?,?)", ("openai", legacy_secret, "legacy", server.now_iso()))
            conn.commit()
        assert_true(legacy_secret.encode() in server.DB_PATH.read_bytes(), "legacy fixture did not contain plaintext secret")

        server.ensure_db()
        with sqlite3.connect(server.DB_PATH) as conn:
            tables = {row[0] for row in conn.execute("select name from sqlite_master where type='table'")}
        assert_true("workspace" in tables, "workspace table missing")
        assert_true("workspace_history" in tables, "workspace_history table missing")
        assert_true("ai_runs" in tables, "ai_runs table missing")
        assert_true("ai_secrets" not in tables, "plaintext ai_secrets table must not exist")
        assert_true(legacy_secret.encode() not in server.DB_PATH.read_bytes(), "legacy plaintext key remains recoverable in SQLite file")
        print("PASS legacy plaintext secret table and bytes are securely purged")

        first = server.save_workspace({"workspace": workspace("revision-one")})
        first_revision = first["workspace"]["revision"]
        assert_true(first_revision == 1, f"expected revision 1, got {first_revision}")
        second = server.save_workspace({"workspace": workspace("revision-two", first_revision + 1)})
        second_revision = second["workspace"]["revision"]
        assert_true(second_revision == 2, f"expected revision 2, got {second_revision}")
        history = server.list_history()["history"]
        assert_true(any(item["revision"] == 1 for item in history), "revision 1 not preserved in history")
        print("PASS transactional revision history increments and preserves backup")

        # Corrupt the current row without updating checksum; load must reject it instead of silently using damaged data.
        with sqlite3.connect(server.DB_PATH) as conn:
            row = conn.execute("select data from workspace where id='default'").fetchone()
            damaged = json.loads(row[0])
            damaged["name"] = "tampered-without-checksum"
            conn.execute("update workspace set data=? where id='default'", (server.canonical_json(damaged),))
            conn.commit()
        checksum_rejected = False
        try:
            server.load_workspace()
        except RuntimeError as exc:
            checksum_rejected = "checksum mismatch" in str(exc).lower()
        assert_true(checksum_rejected, "damaged current workspace was not rejected by checksum verification")
        restored = server.restore_revision({"revision": 1})
        assert_true(restored["workspace"]["name"] == "revision-one", "restore did not recover revision-one data")
        assert_true(restored["workspace"]["revision"] == 3, "restore must create a new monotonic revision")
        assert_true(server.load_workspace()["workspace"]["name"] == "revision-one", "restored data not durable")
        print("PASS checksum corruption is rejected and recovery restore is durable/monotonic")

        status = server.save_session_secret({"provider": "openai", "apiKey": "sk-test-session-only-value"})
        assert_true(status["providers"]["openai"]["source"] == "session", "session key source not reported")
        with sqlite3.connect(server.DB_PATH) as conn:
            tables_after = {row[0] for row in conn.execute("select name from sqlite_master where type='table'")}
        assert_true("ai_secrets" not in tables_after, "session key created a persistent secret table")
        server.delete_session_secret("openai")
        assert_true(not server.secret_status()["providers"]["openai"]["configured"], "session key was not cleared")
        print("PASS API key is session-only and never persisted in SQLite")

        # Save guardrail settings then mock provider transport: no external API/network is used.
        server.save_workspace({"workspace": workspace("ai-mock", 4)})
        server.SESSION_KEYS["openai"] = "sk-test-only"
        original = server.call_openai
        server.call_openai = lambda prompt, model, api_key, max_output_tokens, timeout: ('{"ok":true}', 100, 50)
        try:
            generated = server.ai_generate({"provider": "openai", "model": "mock-openai", "prompt": "test", "maxOutputTokens": 500})
        finally:
            server.call_openai = original
            server.SESSION_KEYS.clear()
        assert_true(generated["inputTokens"] == 100 and generated["outputTokens"] == 50, "token ledger mismatch")
        assert_true(abs(generated["estimatedCostUsd"] - 0.0002) < 1e-9, "estimated cost mismatch")
        ledger = server.ai_runs()
        assert_true(ledger["runs"] and ledger["runs"][0]["ok"], "AI run ledger did not persist successful mock run")
        print("PASS mocked AI run records tokens and estimated cost")

        source = inspect.getsource(server.call_openai)
        assert_true('"store": False' in source, "OpenAI Responses call must set store=false")
        assert_true('"max_output_tokens": max_output_tokens' in source, "OpenAI output bound missing")
        post_source = inspect.getsource(server.post_json)
        assert_true("attempts: int = 3" in post_source and "time.sleep" in post_source, "retry/backoff contract missing")
        assert_true("provider response bodies" in post_source.lower(), "provider error-body redaction contract missing")
        print("PASS OpenAI store=false, output bound, timeout/retry and error-redaction guardrails are present")

        # Cost caps are not silently disabled when volatile provider rates have not been configured.
        no_rates = workspace("no-rates", 5)
        no_rates["settings"]["openAiInputUsdPer1M"] = 0
        no_rates["settings"]["openAiOutputUsdPer1M"] = 0
        server.save_workspace({"workspace": no_rates})
        blocked = False
        try:
            server.enforce_budget("openai", no_rates["settings"])
        except RuntimeError as exc:
            blocked = "configure current openai" in str(exc).lower()
        assert_true(blocked, "cost-capped AI mode ran without configured price rates")
        print("PASS AI cost cap requires explicit current provider rates")

        # Simulate restart: session keys vanish, durable workspace/history remain.
        server.save_workspace({"workspace": workspace("restart-safe", 6)})
        server.SESSION_KEYS["openai"] = "transient"
        server.SESSION_KEYS.clear()
        server.ensure_db()
        assert_true(server.load_workspace()["workspace"]["name"] == "restart-safe", "workspace did not survive restart simulation")
        assert_true(not server.secret_status()["providers"]["openai"]["configured"], "session secret survived restart simulation")
        print("PASS restart recovery retains data but not transient secrets")

    print("\n8/8 server/data-safety checks passed.")


if __name__ == "__main__":
    main()
