#!/usr/bin/env python3
"""Deterministic server/data-safety regression tests for Creator Empire v1.5."""
from __future__ import annotations

import inspect
import io
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import creator_server as server


def assert_true(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def workspace(name: str, revision: int = 0) -> dict:
    return {
        "schemaVersion": 5,
        "revision": revision,
        "id": "default",
        "name": name,
        "updatedAt": server.now_iso(),
        "settings": {
            "openAiModel": "mock-openai",
            "openAiAdvancedModel": "mock-openai-advanced",
            "geminiModel": "mock-gemini",
            "aiMaxOutputTokens": 500,
            "aiRequestTimeoutSeconds": 15,
            "aiDailyBudgetUsd": 10,
            "aiMonthlyBudgetUsd": 100,
            "openAiInputUsdPer1M": 1,
            "openAiOutputUsdPer1M": 2,
            "openAiAdvancedInputUsdPer1M": 10,
            "openAiAdvancedOutputUsdPer1M": 20,
            "openAiSearchUsdPerQuery": 0.01,
            "geminiInputUsdPer1M": 1,
            "geminiOutputUsdPer1M": 2,
            "geminiSearchUsdPerQuery": 0.014,
        },
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="creator-empire-v13-", ignore_cleanup_errors=True) as temp:
        server.DB_PATH = Path(temp) / "creator_empire.sqlite"
        server.SESSION_KEYS.clear()

        # Simulate a v1.2 database that persisted a plaintext provider key.
        legacy_secret = "sk-legacy-plaintext-secret-must-be-purged"
        with server.db_conn() as conn:
            conn.execute("create table ai_secrets(provider text primary key, api_key text not null, model text not null, updated_at text not null)")
            conn.execute("insert into ai_secrets values(?,?,?,?)", ("openai", legacy_secret, "legacy", server.now_iso()))
        assert_true(legacy_secret.encode() in server.DB_PATH.read_bytes(), "legacy fixture did not contain plaintext secret")

        server.ensure_db()
        with server.db_conn() as conn:
            tables = {row[0] for row in conn.execute("select name from sqlite_master where type='table'")}
        assert_true("workspace" in tables, "workspace table missing")
        assert_true("workspace_history" in tables, "workspace_history table missing")
        assert_true("ai_runs" in tables, "ai_runs table missing")
        assert_true("autopilot_jobs" in tables and "autopilot_steps" in tables, "autopilot job tables missing")
        assert_true("youtube_connections" in tables and "video_assets" in tables and "youtube_uploads" in tables, "YouTube integration tables missing")
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
        with server.db_conn() as conn:
            row = conn.execute("select data from workspace where id='default'").fetchone()
            damaged = json.loads(row[0])
            damaged["name"] = "tampered-without-checksum"
            conn.execute("update workspace set data=? where id='default'", (server.canonical_json(damaged),))
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
        server.call_openai = lambda prompt, model, api_key, max_output_tokens, timeout, prompt_type, reasoning_effort: ('{"ok":true}', 100, 50, 0)
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

        fake_results = {
            "topic-research": {"summary": "Grounded topic research", "sources": [{"title": "Primary source", "url": "https://example.com/source", "publisher": "Example", "claimType": "documented", "notes": "Evidence"}], "verifiedFacts": ["Verified"], "disputedClaims": [], "nextAction": "Plan"},
            "autopilot-plan": {"title": "One idea to a finished Short", "angle": "Show the simplest path", "hook": "One click can remove five confusing steps", "contentPlan": ["Problem", "Proof", "Action"]},
            "shorts-script": {"title": "One idea to a finished Short", "hook": "One click can remove five confusing steps", "script": "A complete test narration.", "durationSeconds": 30, "factCaveats": [], "nextAction": "Verify"},
            "fact-check": {"safeSummary": "Claims verified", "claims": [], "blockingIssues": [], "sources": [{"title": "Primary source", "url": "https://example.com/source", "publisher": "Example", "claimType": "documented", "notes": "Evidence"}], "revisedScript": "A verified complete test narration."},
            "autopilot-package": {"description": "Ready to upload", "tags": ["creator"], "thumbnailText": "ONE CLICK", "storyboard": ["Scene 1"], "assetPrompts": ["Clean studio visual"], "capcutBrief": "Edit in 9:16", "canvaBrief": "High contrast thumbnail", "repurposingPlan": "Reuse as a post", "captionsSrt": "1\n00:00:00,000 --> 00:00:03,000\nA verified complete test narration.", "syntheticMediaDisclosure": "Disclose realistic synthetic media."},
        }
        original_generate = server.ai_generate
        def fake_ungrounded_generate(payload):
            prompt_type = payload["promptType"]
            return {
                "ok": True, "text": json.dumps(fake_results[prompt_type]),
                "modelTier": "terra" if prompt_type == "fact-check" else "luna",
                "model": "mock", "inputTokens": 100, "outputTokens": 50,
                "searchQueries": 0, "estimatedCostUsd": 0.001,
            }
        server.ai_generate = fake_ungrounded_generate
        ungrounded = server.create_autopilot_job({"topic": "Grounding gate", "format": "shorts", "durationSeconds": 30, "language": "th"})
        server.process_autopilot_job(ungrounded["job"]["id"])
        blocked_job = server.get_autopilot_job(ungrounded["job"]["id"])["job"]
        assert_true(blocked_job["status"] == "needs_attention" and blocked_job["steps"][0]["status"] == "failed", "Autopilot must fail closed without research search evidence")

        def fake_autopilot_generate(payload):
            prompt_type = payload["promptType"]
            return {
                "ok": True, "text": json.dumps(fake_results[prompt_type]),
                "modelTier": "terra" if prompt_type == "fact-check" else "luna",
                "model": "mock", "inputTokens": 100, "outputTokens": 50,
                "searchQueries": 1 if prompt_type in {"topic-research", "fact-check"} else 0,
                "estimatedCostUsd": 0.001,
            }
        server.ai_generate = fake_autopilot_generate
        try:
            created = server.create_autopilot_job({"topic": "Creator workflow", "format": "shorts", "durationSeconds": 30, "language": "th", "channel": {"key": "business", "name": "FlowBiz", "niche": "business", "promise": "Useful in one minute", "aiFitScore": 94}})
            server.process_autopilot_job(created["job"]["id"])
            job = server.get_autopilot_job(created["job"]["id"])["job"]
            assert_true(job["status"] == "review_ready" and len(job["steps"]) == 5, "autopilot did not reach one-review gate")
            assert_true(job["package"]["modelUsage"]["lunaCalls"] == 4 and job["package"]["modelUsage"]["terraCalls"] == 1, "autopilot model ratio is not 80/20")
            assert_true(job["package"]["script"]["narration"].startswith("A verified"), "Terra revised script was not retained")
            server.approve_autopilot_job(job["id"])
            server.approve_autopilot_job(job["id"])
            archive = server.autopilot_package_zip(job["id"])
            assert_true(len(archive) > 200 and archive[:2] == b"PK", "handoff package is not a ZIP archive")
            with server.db_conn() as conn:
                conn.execute("update autopilot_jobs set status='running' where id=?", (ungrounded["job"]["id"],))
            server.recover_interrupted_jobs()
            assert_true(server.get_autopilot_job(ungrounded["job"]["id"])["job"]["status"] == "queued", "interrupted Autopilot job was not requeued")
        finally:
            server.ai_generate = original_generate
        print("PASS Autopilot grounds research, resumes after restart, stays approval-idempotent and reaches exact 80/20")

        from cryptography.fernet import Fernet
        previous_token_key = os.environ.get("CREATOR_EMPIRE_TOKEN_KEY")
        os.environ["CREATOR_EMPIRE_TOKEN_KEY"] = Fernet.generate_key().decode("ascii")
        try:
            encrypted = server.encrypt_secret('{"refresh_token":"test-refresh-token"}')
            assert_true("test-refresh-token" not in encrypted, "OAuth refresh token remained plaintext")
            assert_true("test-refresh-token" in server.decrypt_secret(encrypted), "encrypted OAuth token could not be recovered")
            invalid_state = False
            try:
                server.complete_youtube_oauth("code", "missing-state")
            except PermissionError:
                invalid_state = True
            assert_true(invalid_state, "OAuth callback accepted an invalid CSRF state")
        finally:
            if previous_token_key is None:
                os.environ.pop("CREATOR_EMPIRE_TOKEN_KEY", None)
            else:
                os.environ["CREATOR_EMPIRE_TOKEN_KEY"] = previous_token_key
        youtube_source = inspect.getsource(server.process_youtube_upload)
        assert_true('Content-Range' in youtube_source and "status='uploaded'" in youtube_source, "resumable YouTube upload contract missing")
        assert_true('"privacyStatus": "private"' in inspect.getsource(server._initiate_youtube_session), "YouTube uploads must be private")
        assert_true(server.YOUTUBE_UPLOAD_SCOPE == "https://www.googleapis.com/auth/youtube.upload", "YouTube OAuth scope is broader than upload-only")
        print("PASS YouTube OAuth state, encrypted token storage, upload-only scope and private resumable upload contract")

        previous_upload_dir = server.VIDEO_UPLOAD_DIR
        server.VIDEO_UPLOAD_DIR = Path(temp) / "video-assets"
        try:
            class FakeUpload:
                headers = {
                    "Content-Length": "4", "Content-Type": "video/mp4",
                    "X-Filename": "..%2F..%2Fescape.mp4", "X-Project-Id": "qa-project",
                }
                rfile = io.BytesIO(b"test")

            asset = server.receive_video_asset(FakeUpload())
            with server.db_conn() as conn:
                stored = conn.execute("select filename,stored_path,size_bytes from video_assets where id=?", (asset["asset"]["id"],)).fetchone()
            assert_true(stored[0] == "escape.mp4" and Path(stored[1]).parent == server.VIDEO_UPLOAD_DIR.resolve(), "video filename traversal escaped upload storage")
            assert_true(stored[2] == 4, "streamed video size ledger mismatch")

            class OversizeUpload:
                headers = {"Content-Length": str(server.MAX_VIDEO_BYTES + 1), "Content-Type": "video/mp4", "X-Filename": "large.mp4"}
                rfile = io.BytesIO()

            rejected = False
            try:
                server.receive_video_asset(OversizeUpload())
            except ValueError as exc:
                rejected = "upload limit" in str(exc).lower()
            assert_true(rejected, "video upload limit was not enforced before streaming")
        finally:
            server.VIDEO_UPLOAD_DIR = previous_upload_dir
        print("PASS MP4 streaming sanitizes paths and enforces the 2 GiB default limit")

        source = inspect.getsource(server.call_openai)
        assert_true('"store": False' in source, "OpenAI Responses call must set store=false")
        assert_true('"max_output_tokens": max_output_tokens' in source, "OpenAI output bound missing")
        assert_true('"type": "json_schema"' in source and '"strict": True' in source, "OpenAI strict structured output missing")
        assert_true('request_payload["tools"] = [{"type": "web_search"}]' in source, "OpenAI research grounding tool missing")
        assert_true('request_payload["tool_choice"] = "required"' in source, "OpenAI research grounding must be mandatory")
        post_source = inspect.getsource(server.post_json)
        assert_true("attempts: int = 3" in post_source and "Retry-After" in post_source and "time.sleep" in post_source, "retry/backoff contract must cap automatic retries at two")
        assert_true("for response_attempt in range(2)" in source and "RELIABILITY REPAIR" in source, "one structured JSON repair is required")
        assert_true("provider response bodies" in post_source.lower(), "provider error-body redaction contract missing")
        luna_route = server.route_openai_model(workspace("router")["settings"], "hook-generator")
        terra_route = server.route_openai_model(workspace("router")["settings"], "fact-check")
        override_route = server.route_openai_model(workspace("router")["settings"], "long-script", True)
        assert_true(luna_route == ("mock-openai", "luna", "low"), "default OpenAI route must use Luna/low")
        assert_true(terra_route == ("mock-openai-advanced", "terra", "medium"), "complex OpenAI route must use Terra/medium")
        assert_true(override_route == terra_route, "important script override must promote to Terra")
        assert_true(len(server.OPENAI_ADVANCED_PROMPT_TYPES) == 3, "Terra default share must be 3 of 16 workflows")
        assert_true(server.openai_response_schema("shorts-script")["additionalProperties"] is False, "OpenAI schema must reject extra root fields")
        grounded_openai_cost = server.estimate_cost("openai", 100, 50, workspace("grounded-openai")["settings"], 2, "mock-openai")
        assert_true(abs(grounded_openai_cost - 0.0202) < 1e-9, "OpenAI web search cost must be included in the ledger")
        handler_source = inspect.getsource(server.CreatorHandler)
        assert_true("def do_HEAD" in handler_source and "serve_static(head_only=True)" in handler_source, "Static HEAD support missing")
        print("PASS OpenAI structured outputs, 81.25/18.75 router, store=false, timeout/retry and redaction guardrails are present")

        gemini_source = inspect.getsource(server.call_gemini)
        assert_true('generation_config["responseSchema"] = schema' in gemini_source, "Gemini structured JSON schema mode missing")
        assert_true('request_payload["tools"] = [{"google_search": {}}]' in gemini_source, "Gemini research grounding tool missing")
        assert_true(len(server.SUPPORTED_PROMPT_TYPES) == 18 and {"autopilot-plan", "autopilot-package"}.issubset(server.SUPPORTED_PROMPT_TYPES), "AI capability inventory must keep 16 Expert prompts plus two internal Autopilot contracts")
        rejected_prompt_type = False
        try:
            server.ai_generate({"provider": "openai", "model": "mock-openai", "prompt": "test", "promptType": "unknown"})
        except ValueError as exc:
            rejected_prompt_type = "unsupported prompttype" in str(exc).lower()
        assert_true(rejected_prompt_type, "unknown AI prompt type was not rejected")
        grounded_cost = server.estimate_cost("gemini", 100, 50, workspace("grounded")["settings"], 2)
        assert_true(abs(grounded_cost - 0.0282) < 1e-9, "grounded search cost must be included in the AI budget ledger")
        print("PASS Gemini structured JSON, Search grounding cost and 16-workflow capability contract are enforced")

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

        previous_daily = os.environ.get("CREATOR_EMPIRE_MAX_DAILY_USD")
        os.environ["CREATOR_EMPIRE_MAX_DAILY_USD"] = "0.25"
        try:
            hard_daily, _ = server.budget_limits({"aiDailyBudgetUsd": 999, "aiMonthlyBudgetUsd": 1000})
        finally:
            if previous_daily is None:
                os.environ.pop("CREATOR_EMPIRE_MAX_DAILY_USD", None)
            else:
                os.environ["CREATOR_EMPIRE_MAX_DAILY_USD"] = previous_daily
        assert_true(hard_daily == 0.25, "environment hard budget ceiling did not override mutable workspace setting")
        print("PASS environment hard budget ceiling cannot be raised from the browser workspace")

        # Simulate restart: session keys vanish, durable workspace/history remain.
        server.save_workspace({"workspace": workspace("restart-safe", 6)})
        server.SESSION_KEYS["openai"] = "transient"
        server.SESSION_KEYS.clear()
        server.ensure_db()
        assert_true(server.load_workspace()["workspace"]["name"] == "restart-safe", "workspace did not survive restart simulation")
        assert_true(not server.secret_status()["providers"]["openai"]["configured"], "session secret survived restart simulation")
        print("PASS restart recovery retains data but not transient secrets")

        import gc
        gc.collect()

    print("\n13/13 server/data-safety checks passed.")


if __name__ == "__main__":
    main()
