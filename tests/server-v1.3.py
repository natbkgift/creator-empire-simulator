#!/usr/bin/env python3
"""Deterministic server/data-safety tests for Creator Empire v1.3."""
from __future__ import annotations

import inspect
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
            "geminiInputUsdPer1M": 0,
            "geminiOutputUsdPer1M": 0,
        },
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="creator-empire-v13-") as temp:
        server.DB_PATH = Path(temp) / "creator_empire.sqlite"
        server.SESSION_KEYS.clear()
        server.ensure_db()

        with sqlite3.connect(server.DB_PATH) as conn:
            tables = {row[0] for row in conn.execute("select name from sqlite_master where type='table'")}
        assert_true("workspace" in tables, "workspace table missing")
        assert_true("workspace_history" in tables, "workspace_history table missing")
        assert_true("ai_runs" in tables, "ai_runs table missing")
        assert_true("ai_secrets" not in tables, "plaintext ai_secrets table must not exist")
        print("PASS SQLite schema has history and no plaintext secret table")

        first = server.save_workspace({"workspace": workspace("revision-one")})
        first_revision = first["workspace"]["revision"]
        assert_true(first_revision == 1, f"expected revision 1, got {first_revision}")
        second = server.save_workspace({"workspace": workspace("revision-two", first_revision + 1)})
        second_revision = second["workspace"]["revision"]
        assert_true(second_revision == 2, f"expected revision 2, got {second_revision}")
        history = server.list_history()["history"]
        assert_true(any(item["revision"] == 1 for item in history), "revision 1 not preserved in history")
        print("PASS transactional revision history increments and preserves backup")

        restored = server.restore_revision({"revision": 1})
        assert_true(restored["workspace"]["name"] == "revision-one", "restore did not recover revision-one data")
        assert_true(restored["workspace"]["revision"] == 3, "restore must create a new monotonic revision")
        assert_true(server.load_workspace()["workspace"]["name"] == "revision-one", "restored data not durable")
        print("PASS recovery restore is durable and monotonic")

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
        print("PASS OpenAI store=false, output bound, timeout/retry guardrails are present")

        # Simulate restart: session keys vanish, durable workspace/history remain.
        server.SESSION_KEYS["openai"] = "transient"
        server.SESSION_KEYS.clear()
        server.ensure_db()
        assert_true(server.load_workspace()["workspace"]["name"] == "ai-mock", "workspace did not survive restart simulation")
        assert_true(not server.secret_status()["providers"]["openai"]["configured"], "session secret survived restart simulation")
        print("PASS restart recovery retains data but not transient secrets")

    print("\n7/7 server/data-safety checks passed.")


if __name__ == "__main__":
    main()
