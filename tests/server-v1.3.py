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


def save_workspace_value(value: dict, expected_revision: int | None = None) -> dict:
    if expected_revision is None:
        current = server.load_workspace()["workspace"]
        expected_revision = int(current.get("revision", 0)) if current else 0
    return server.save_workspace({"workspace": value, "expectedRevision": expected_revision})


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
        with server.db_conn() as conn:
            upload_columns = server.column_names(conn, "youtube_uploads")
            step_columns = server.column_names(conn, "autopilot_steps")
        assert_true("job_id" in upload_columns, "YouTube uploads must be scoped to an Autopilot job")
        assert_true("model_name" in step_columns, "Autopilot steps must retain the exact model name")
        assert_true("ai_secrets" not in tables, "plaintext ai_secrets table must not exist")
        assert_true(legacy_secret.encode() not in server.DB_PATH.read_bytes(), "legacy plaintext key remains recoverable in SQLite file")
        print("PASS legacy plaintext secret table and bytes are securely purged")

        missing_job_key_rejected = False
        try:
            server.create_autopilot_job({"topic": "Missing request identity", "format": "shorts", "language": "th"})
        except ValueError as exc:
            missing_job_key_rejected = "idempotencykey is required" in str(exc).lower()
        assert_true(missing_job_key_rejected, "Autopilot creation accepted provider-bearing work without an idempotency key")

        idempotent_payload = {
            "idempotencyKey": "test-autopilot-create-1",
            "topic": "Durable request identity",
            "format": "shorts",
            "durationSeconds": 30,
            "language": "th",
        }
        first_job = server.create_autopilot_job(idempotent_payload)
        repeated_job = server.create_autopilot_job(idempotent_payload)
        with server.db_conn() as conn:
            matching_jobs = conn.execute(
                "select count(*) from autopilot_jobs where id in (?,?)",
                (first_job["job"]["id"], repeated_job["job"]["id"]),
            ).fetchone()[0]
        assert_true(first_job["job"]["id"] == repeated_job["job"]["id"], "repeated Autopilot request created a second job")
        assert_true(first_job["job"].get("idempotencyKey") == idempotent_payload["idempotencyKey"], "job response omitted its durable request identity")
        assert_true(matching_jobs == 1, "repeated Autopilot request persisted duplicate work")
        claimed_job = server.claim_next_autopilot_job()
        assert_true(claimed_job == first_job["job"]["id"], "worker did not atomically claim the queued Autopilot job")
        assert_true(server.claim_next_autopilot_job() is None, "a second worker claimed the same Autopilot job")
        with server.db_conn() as conn:
            conn.execute("update autopilot_jobs set status='cancelled' where id=?", (claimed_job,))
        print("PASS Autopilot creation reuses one durable job for an idempotency key")

        first = save_workspace_value(workspace("revision-one"), 0)
        first_revision = first["workspace"]["revision"]
        assert_true(first_revision == 1, f"expected revision 1, got {first_revision}")
        second = save_workspace_value(workspace("revision-two", first_revision + 1), first_revision)
        second_revision = second["workspace"]["revision"]
        assert_true(second_revision == 2, f"expected revision 2, got {second_revision}")
        stale_rejected = False
        try:
            save_workspace_value(workspace("stale-overwrite", first_revision), first_revision)
        except ValueError as exc:
            stale_rejected = "stale workspace revision" in str(exc).lower()
        assert_true(stale_rejected, "server accepted a stale full-workspace overwrite")
        assert_true(server.load_workspace()["workspace"]["name"] == "revision-two", "stale workspace replaced the authoritative revision")
        jumped = save_workspace_value(workspace("no-revision-gap", 999), second_revision)
        assert_true(jumped["workspace"]["revision"] == second_revision + 1, "server trusted an arbitrary client revision instead of incrementing authoritatively")
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
        assert_true(restored["workspace"]["revision"] == jumped["workspace"]["revision"] + 1, "restore must create a new monotonic revision")
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
        save_workspace_value(workspace("ai-mock", 4))
        server.SESSION_KEYS["openai"] = "sk-test-only"
        original = server.call_openai
        server.call_openai = lambda prompt, model, api_key, max_output_tokens, timeout, prompt_type, reasoning_effort: ('{"ok":true}', 100, 50, 0, "mock-openai-2026-08-11")
        try:
            generated = server.ai_generate({"provider": "openai", "model": "mock-openai", "prompt": "test", "maxOutputTokens": 500})
        finally:
            server.call_openai = original
            server.SESSION_KEYS.clear()
        assert_true(generated["inputTokens"] == 100 and generated["outputTokens"] == 50, "token ledger mismatch")
        assert_true(generated["model"] == "mock-openai-2026-08-11", "AI run did not retain the provider-reported exact model identity")
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
        ungrounded = server.create_autopilot_job({"idempotencyKey": "test-grounding-gate", "topic": "Grounding gate", "format": "shorts", "durationSeconds": 30, "language": "th"})
        server.process_autopilot_job(ungrounded["job"]["id"])
        blocked_job = server.get_autopilot_job(ungrounded["job"]["id"])["job"]
        assert_true(blocked_job["status"] == "needs_attention" and blocked_job["steps"][0]["status"] == "failed", "Autopilot must fail closed without research search evidence")

        exact_step_model = "mock-" + ("v" * 140)
        def fake_autopilot_generate(payload):
            prompt_type = payload["promptType"]
            return {
                "ok": True, "text": json.dumps(fake_results[prompt_type]),
                "modelTier": "terra" if prompt_type == "fact-check" else "luna",
                "model": exact_step_model, "inputTokens": 100, "outputTokens": 50,
                "searchQueries": 1 if prompt_type in {"topic-research", "fact-check"} else 0,
                "estimatedCostUsd": 0.001,
            }
        server.ai_generate = fake_autopilot_generate
        try:
            created = server.create_autopilot_job({"idempotencyKey": "test-creator-workflow", "topic": "Creator workflow", "format": "shorts", "durationSeconds": 30, "language": "th", "channel": {"key": "business", "name": "FlowBiz", "niche": "business", "promise": "Useful in one minute", "aiFitScore": 94}})
            server.process_autopilot_job(created["job"]["id"])
            job = server.get_autopilot_job(created["job"]["id"])["job"]
            assert_true(job["status"] == "review_ready" and len(job["steps"]) == 5, "autopilot did not reach one-review gate")
            assert_true(job["package"]["modelUsage"]["lunaCalls"] == 4 and job["package"]["modelUsage"]["terraCalls"] == 1, "autopilot model ratio is not 80/20")
            assert_true(all(step["model"] == exact_step_model for step in job["steps"]), "Autopilot step ledger truncated the exact model sequence")
            assert_true(job["package"]["script"]["narration"].startswith("A verified"), "Terra revised script was not retained")
            approval_response = server.approve_autopilot_job(job["id"])
            first_approval = approval_response["job"]
            repeated_approval = server.approve_autopilot_job(job["id"])["job"]
            workspace_after_approval = server.load_workspace()["workspace"]
            reconciled_projects = [
                project for project in workspace_after_approval.get("projects", [])
                if project.get("autopilotJobId") == job["id"]
            ]
            assert_true(len(reconciled_projects) == 1, "approval did not reconcile exactly one authoritative workspace project")
            assert_true(approval_response["workspace"]["revision"] == workspace_after_approval["revision"], "approval response omitted the authoritative reconciled workspace")
            assert_true(first_approval["approvedAt"] == repeated_approval["approvedAt"], "repeated approval replaced the original approval timestamp")
            archive = server.autopilot_package_zip(job["id"])
            assert_true(len(archive) > 200 and archive[:2] == b"PK", "handoff package is not a ZIP archive")
            with server.db_conn() as conn:
                conn.execute("update autopilot_jobs set status='running' where id=?", (ungrounded["job"]["id"],))
            server.recover_interrupted_jobs()
            interrupted_job = server.get_autopilot_job(ungrounded["job"]["id"])["job"]
            assert_true(interrupted_job["status"] == "needs_attention", "ambiguous interrupted Autopilot work was automatically replayed")
            assert_true("ambiguous" in interrupted_job["error"].lower(), "interrupted Autopilot work omitted its reconciliation warning")
            ambiguous_job_retry_rejected = False
            try:
                server.retry_autopilot_job(ungrounded["job"]["id"])
            except ValueError as exc:
                ambiguous_job_retry_rejected = "reconciliation" in str(exc).lower()
            assert_true(ambiguous_job_retry_rejected, "ambiguous Autopilot work could be retried without reconciliation")
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
        assert_true("exc.code in {500, 502, 503, 504}" not in youtube_source and "reconciliation is required" in youtube_source, "ambiguous resumable chunk failures can be retransmitted without offset reconciliation")
        assert_true("_provider_http_requires_reconciliation(exc.code)" in youtube_source and "request rejected" in youtube_source, "definitive chunk rejection was permanently reconciliation-blocked")
        assert_true('"privacyStatus": "private"' in inspect.getsource(server._initiate_youtube_session), "YouTube uploads must be private")
        assert_true(server.YOUTUBE_UPLOAD_SCOPE == "https://www.googleapis.com/auth/youtube.upload", "YouTube OAuth scope is broader than upload-only")
        session_attempts = 0

        def ambiguous_youtube_session(*_args, **_kwargs):
            nonlocal session_attempts
            session_attempts += 1
            raise server.urllib.error.HTTPError("https://www.googleapis.com/upload/youtube/v3/videos", 500, "backendError", {}, io.BytesIO(b"{}"))

        original_urlopen = server.urllib.request.urlopen
        original_sleep = server.time.sleep
        server.urllib.request.urlopen = ambiguous_youtube_session
        server.time.sleep = lambda *_args: None
        try:
            session_failed_closed = False
            try:
                server._initiate_youtube_session("token", {"title": "QA", "description": "", "tags": [], "categoryId": "22", "containsSyntheticMedia": True}, 4)
            except RuntimeError as exc:
                session_failed_closed = "reconciliation" in str(exc).lower()
            assert_true(session_failed_closed and session_attempts == 1, "ambiguous YouTube session initiation was automatically replayed")
        finally:
            server.urllib.request.urlopen = original_urlopen
            server.time.sleep = original_sleep
        print("PASS YouTube OAuth state, encrypted token storage, upload-only scope and private resumable upload contract")

        # A completed upload from another project must never appear on a newly
        # approved package. This regression protects the handoff screen from
        # showing stale global YouTube success state across Autopilot jobs.
        with server.db_conn() as conn:
            created = server.now_iso()
            conn.execute(
                "insert into youtube_uploads(id,asset_id,job_id,status,progress,metadata_json,video_id,video_url,created_at,updated_at) values(?,?,?,'uploaded',100,'{}',?,?,?,?)",
                ("yt-old", "asset-old", "job-old", "old-video", "https://youtu.be/old-video", created, created),
            )
        assert_true(server.youtube_status("job-new")["latestUpload"] is None, "new job inherited another job's YouTube upload state")
        scoped_upload = server.youtube_status("job-old")["latestUpload"]
        assert_true(scoped_upload and scoped_upload["videoId"] == "old-video", "job-scoped YouTube status did not return its own upload")
        print("PASS YouTube handoff status is isolated per Autopilot job")

        previous_upload_dir = server.VIDEO_UPLOAD_DIR
        server.VIDEO_UPLOAD_DIR = Path(temp) / "video-assets"
        try:
            class FakeUpload:
                headers = {
                    "Content-Length": "4", "Content-Type": "video/mp4",
                    "X-Filename": "..%2F..%2Fescape.mp4", "X-Project-Id": job["id"],
                }
                rfile = io.BytesIO(b"test")

            asset = server.receive_video_asset(FakeUpload())
            class OtherJobUpload:
                headers = {
                    "Content-Length": "4", "Content-Type": "video/mp4",
                    "X-Filename": "other.mp4", "X-Project-Id": "another-job",
                }
                rfile = io.BytesIO(b"test")

            other_job_asset = server.receive_video_asset(OtherJobUpload())
            with server.db_conn() as conn:
                stored = conn.execute("select filename,stored_path,size_bytes from video_assets where id=?", (asset["asset"]["id"],)).fetchone()
            assert_true(stored[0] == "escape.mp4" and Path(stored[1]).parent == server.VIDEO_UPLOAD_DIR.resolve(), "video filename traversal escaped upload storage")
            assert_true(stored[2] == 4, "streamed video size ledger mismatch")

            original_youtube_status = server.youtube_status
            server.youtube_status = lambda *_args: {"configured": True, "connected": True}
            try:
                cross_job_rejected = False
                try:
                    server.create_youtube_upload({
                        "idempotencyKey": "test-youtube-cross-job",
                        "assetId": other_job_asset["asset"]["id"],
                        "jobId": job["id"],
                        "metadata": {"title": "Wrong job asset"},
                    })
                except ValueError as exc:
                    cross_job_rejected = "same autopilot job" in str(exc).lower()
                assert_true(cross_job_rejected, "YouTube creation accepted a video asset owned by another Autopilot job")
                missing_upload_key_rejected = False
                try:
                    server.create_youtube_upload({
                        "assetId": asset["asset"]["id"],
                        "jobId": job["id"],
                        "metadata": {"title": "Missing request identity"},
                    })
                except ValueError as exc:
                    missing_upload_key_rejected = "idempotencykey is required" in str(exc).lower()
                assert_true(missing_upload_key_rejected, "YouTube creation accepted provider-bearing work without an idempotency key")
                upload_payload = {
                    "idempotencyKey": "test-youtube-upload-1",
                    "assetId": asset["asset"]["id"],
                    "jobId": job["id"],
                    "metadata": {"title": "Private test upload"},
                }
                first_upload = server.create_youtube_upload(upload_payload)
                repeated_upload = server.create_youtube_upload(upload_payload)
            finally:
                server.youtube_status = original_youtube_status
            with server.db_conn() as conn:
                matching_uploads = conn.execute(
                    "select count(*) from youtube_uploads where id in (?,?)",
                    (first_upload["upload"]["id"], repeated_upload["upload"]["id"]),
                ).fetchone()[0]
            assert_true(first_upload["upload"]["id"] == repeated_upload["upload"]["id"], "repeated YouTube request queued a second upload")
            assert_true(matching_uploads == 1, "repeated YouTube request persisted duplicate provider work")
            claimed_upload = server.claim_next_youtube_upload()
            assert_true(claimed_upload == first_upload["upload"]["id"], "worker did not atomically claim the queued YouTube upload")
            assert_true(server.claim_next_youtube_upload() is None, "a second worker claimed the same YouTube upload")
            server.recover_interrupted_jobs()
            interrupted_upload = server.get_youtube_upload(claimed_upload)["upload"]
            assert_true(interrupted_upload["status"] == "needs_attention", "ambiguous interrupted YouTube upload was automatically replayed")
            assert_true("ambiguous" in interrupted_upload["error"].lower(), "interrupted YouTube upload omitted its reconciliation warning")
            ambiguous_upload_retry_rejected = False
            try:
                server.retry_youtube_upload(claimed_upload)
            except ValueError as exc:
                ambiguous_upload_retry_rejected = "reconciliation" in str(exc).lower()
            assert_true(ambiguous_upload_retry_rejected, "ambiguous YouTube work could be retried without reconciliation")

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
        print("PASS MP4 streaming sanitizes paths, enforces limits and deduplicates upload creation")

        source = inspect.getsource(server.call_openai)
        assert_true("resolved_models" in source and '" -> ".join(resolved_models)' in source, "structured repair does not retain every provider-reported model identity")
        assert_true('"store": False' in source, "OpenAI Responses call must set store=false")
        assert_true('"max_output_tokens": max_output_tokens' in source, "OpenAI output bound missing")
        assert_true('"type": "json_schema"' in source and '"strict": True' in source, "OpenAI strict structured output missing")
        assert_true('request_payload["tools"] = [{"type": "web_search"}]' in source, "OpenAI research grounding tool missing")
        assert_true('request_payload["tool_choice"] = "required"' in source, "OpenAI research grounding must be mandatory")
        post_source = inspect.getsource(server.post_json)
        assert_true(not server._provider_http_requires_reconciliation(400), "definitive provider rejection was incorrectly reconciliation-blocked")
        assert_true(server._provider_http_requires_reconciliation(429) and server._provider_http_requires_reconciliation(500), "ambiguous provider HTTP outcomes were not reconciliation-blocked")
        assert_true(not server._requires_reconciliation("YouTube upload HTTP 400; request rejected"), "definitive chunk rejection was reconciliation-latched")
        provider_post_attempts = 0

        def ambiguous_provider_post(*_args, **_kwargs):
            nonlocal provider_post_attempts
            provider_post_attempts += 1
            raise TimeoutError("provider response was lost")

        original_urlopen = server.urllib.request.urlopen
        original_sleep = server.time.sleep
        server.urllib.request.urlopen = ambiguous_provider_post
        server.time.sleep = lambda *_args: None
        try:
            try:
                server.post_json("https://provider.invalid/generate", {}, {"prompt": "test"}, 1)
            except RuntimeError:
                pass
        finally:
            server.urllib.request.urlopen = original_urlopen
            server.time.sleep = original_sleep
        assert_true(provider_post_attempts == 1, "ambiguous provider POST was automatically replayed")
        class MalformedProviderResponse:
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self):
                return b"{"

        server.urllib.request.urlopen = lambda *_args, **_kwargs: MalformedProviderResponse()
        try:
            malformed_requires_reconciliation = False
            try:
                server.post_json("https://provider.invalid/generate", {}, {"prompt": "test"}, 1)
            except RuntimeError as exc:
                malformed_requires_reconciliation = "reconciliation" in str(exc).lower()
            assert_true(malformed_requires_reconciliation, "post-dispatch provider response parse failure was retryable without reconciliation")
        finally:
            server.urllib.request.urlopen = original_urlopen
        class NonObjectProviderResponse:
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self):
                return b"[]"

        server.urllib.request.urlopen = lambda *_args, **_kwargs: NonObjectProviderResponse()
        try:
            non_object_requires_reconciliation = False
            try:
                server.post_json("https://provider.invalid/generate", {}, {"prompt": "test"}, 1)
            except RuntimeError as exc:
                non_object_requires_reconciliation = server._requires_reconciliation(exc)
            assert_true(non_object_requires_reconciliation, "non-object provider envelope was not reconciliation-blocked")
        finally:
            server.urllib.request.urlopen = original_urlopen

        openai_responses = iter([
            {"model": "exact-openai-v1", "output_text": "{", "usage": {}},
            {"model": "exact-openai-v1", "output_text": "{}", "usage": {}},
        ])
        original_post_json = server.post_json
        server.post_json = lambda *_args, **_kwargs: next(openai_responses)
        try:
            repaired_openai = server.call_openai("test", "alias", "test", 128, 1)
        finally:
            server.post_json = original_post_json
        assert_true(repaired_openai[4] == "exact-openai-v1 -> exact-openai-v1", "OpenAI repair omitted a provider-call model identity")

        failed_repair_responses = iter([
            {"model": "exact-openai-before-failure", "output_text": "{", "usage": {"input_tokens": 7, "output_tokens": 3}},
            RuntimeError("provider request outcome is ambiguous; reconciliation is required before retry"),
        ])
        def failed_repair_post(*_args, **_kwargs):
            item = next(failed_repair_responses)
            if isinstance(item, Exception):
                raise item
            return item
        server.post_json = failed_repair_post
        server.SESSION_KEYS["openai"] = "test-only"
        try:
            try:
                server.ai_generate({"provider": "openai", "prompt": "test"})
            except RuntimeError:
                pass
        finally:
            server.post_json = original_post_json
            server.SESSION_KEYS.clear()
        failed_repair_run = server.ai_runs()["runs"][0]
        assert_true(failed_repair_run["model"] == "exact-openai-before-failure", "failed repair ledger discarded the provider-reported exact model identity")
        assert_true(failed_repair_run["estimatedCostUsd"] > 0, "failed repair ledger omitted known billable token cost")

        gemini_responses = iter([
            {"modelVersion": "exact-gemini-v1", "candidates": [{"content": {"parts": [{"text": "{"}]}}], "usageMetadata": {}},
            {"modelVersion": "exact-gemini-v1", "candidates": [{"content": {"parts": [{"text": "{}"}]}}], "usageMetadata": {}},
        ])
        server.post_json = lambda *_args, **_kwargs: next(gemini_responses)
        try:
            repaired_gemini = server.call_gemini("test", "gemini-test", "test", 128, 1)
        finally:
            server.post_json = original_post_json
        assert_true(repaired_gemini[4] == "exact-gemini-v1 -> exact-gemini-v1", "Gemini repair omitted a provider-call model identity")
        assert_true("for response_attempt in range(2)" in source and "RELIABILITY REPAIR" in source, "one structured JSON repair is required")
        assert_true("provider response bodies" in post_source.lower(), "provider error-body redaction contract missing")

        class MissingLocationResponse:
            headers = {}
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False

        server.urllib.request.urlopen = lambda *_args, **_kwargs: MissingLocationResponse()
        try:
            missing_location_blocked = False
            try:
                server._initiate_youtube_session("test", {"title": "QA", "description": "", "tags": [], "categoryId": "22", "containsSyntheticMedia": True}, 4)
            except RuntimeError as exc:
                missing_location_blocked = server._requires_reconciliation(exc)
            assert_true(missing_location_blocked, "post-dispatch session response without Location was retryable")
        finally:
            server.urllib.request.urlopen = original_urlopen

        assert_true(server._youtube_acknowledged_offset("bytes=0-3", 0, 7) == 4, "partial resumable acknowledgement offset was not parsed")
        missing_range_blocked = False
        try:
            server._youtube_acknowledged_offset("", 0, 7)
        except RuntimeError as exc:
            missing_range_blocked = server._requires_reconciliation(exc)
        assert_true(missing_range_blocked, "308 without Range inferred an unproven chunk checkpoint")
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
        print("PASS OpenAI structured outputs, 81.25/18.75 router, store=false, no blind replay and redaction guardrails are present")

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
        no_rates = workspace("no-rates", server.load_workspace()["workspace"]["revision"] + 1)
        no_rates["settings"]["openAiInputUsdPer1M"] = 0
        no_rates["settings"]["openAiOutputUsdPer1M"] = 0
        save_workspace_value(no_rates)
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
        save_workspace_value(workspace("restart-safe", server.load_workspace()["workspace"]["revision"] + 1))
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
