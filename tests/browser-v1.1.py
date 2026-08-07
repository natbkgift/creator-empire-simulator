#!/usr/bin/env python3
"""Creator Empire Simulator v1.1 focused-workflow browser acceptance test.

Requires Python Playwright and a Chromium executable. The app must already be
served at CREATOR_EMPIRE_URL (default http://127.0.0.1:4173).
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / "screenshots"
EVIDENCE = ROOT / "docs" / "evidence"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(parents=True, exist_ok=True)
BASE_URL = os.environ.get("CREATOR_EMPIRE_URL", "http://127.0.0.1:4173").rstrip("/")
CHROMIUM = os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium")
PROFILE = Path(os.environ.get("CREATOR_EMPIRE_QA_PROFILE", "/tmp/creator-empire-v1.1-qa-profile"))

checks: list[dict[str, Any]] = []
console_messages: list[dict[str, str]] = []
page_errors: list[str] = []
request_failures: list[dict[str, str]] = []
route_matrix: list[dict[str, Any]] = []
mobile_matrix: list[dict[str, Any]] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    checks.append({"name": name, "passed": bool(passed), "detail": detail})
    print(("PASS" if passed else "FAIL"), name, f"— {detail}" if detail else "")


def require(name: str, condition: bool, detail: str = "") -> None:
    record(name, condition, detail)
    if not condition:
        raise AssertionError(f"{name}: {detail}")


def wait_app(page: Page) -> None:
    page.wait_for_selector("#app", state="attached")
    page.wait_for_timeout(250)


def complete_onboarding(page: Page) -> None:
    if page.get_by_role("button", name="เริ่มตั้งค่า").count():
        page.get_by_role("button", name="เริ่มตั้งค่า").click()
        page.get_by_role("button", name="บันทึกและไปต่อ").click()
        page.get_by_role("button", name="เข้า Studio HQ").click()
        wait_app(page)


def route(page: Page, name: str, params: str = "") -> None:
    suffix = f"?{params}" if params else ""
    page.goto(f"{BASE_URL}/#/{name}{suffix}", wait_until="domcontentloaded", timeout=30_000)
    wait_app(page)


def route_metrics(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """() => ({
          url: location.href,
          title: document.title,
          heading: document.querySelector('.page-header h2')?.textContent?.trim() || '',
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
          fatal: Boolean(document.querySelector('.fatal-error, vite-error-overlay')),
          visibleUnnamedButtons: [...document.querySelectorAll('button')].filter((el) => {
            const r = el.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
            return visible && !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title');
          }).length,
        })"""
    )


storyboard_payload = {
    "title": "Wojtek: The Soldier Bear",
    "durationSeconds": 55,
    "scenes": [
        {"start": 0, "end": 3, "narration": "This bear was not just a mascot.", "visual": "Wojtek beside Polish soldiers", "onScreenText": "A REAL SOLDIER?", "sourceNote": "AI historical reconstruction"},
        {"start": 3, "end": 10, "narration": "He travelled with Polish soldiers.", "visual": "Map route toward Italy", "onScreenText": "POLISH II CORPS", "sourceNote": "Museum context"},
        {"start": 10, "end": 20, "narration": "Accounts describe camp life.", "visual": "1940s camp reconstruction", "onScreenText": "1940s", "sourceNote": "Reported account"},
        {"start": 20, "end": 32, "narration": "Details about ammunition differ.", "visual": "Monte Cassino landscape", "onScreenText": "ACCOUNTS DIFFER", "sourceNote": "Disputed detail"},
        {"start": 32, "end": 45, "narration": "The unit adopted a bear emblem.", "visual": "Bear carrying a shell emblem", "onScreenText": "THE EMBLEM", "sourceNote": "Documented"},
        {"start": 45, "end": 55, "narration": "He later lived in Edinburgh Zoo.", "visual": "Edinburgh ending", "onScreenText": "A LASTING SYMBOL", "sourceNote": "Documented"},
    ],
    "disclosure": "AI historical reconstruction",
}

routes = [
    "hq", "mission", "map", "ideas", "blueprint", "production", "prompts",
    "capcut", "calendar", "simulator", "analytics", "monetization", "policy",
    "import-export", "settings",
]


def main() -> int:
    if PROFILE.exists():
        shutil.rmtree(PROFILE)

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(PROFILE),
            headless=True,
            executable_path=CHROMIUM,
            args=["--no-sandbox"],
            viewport={"width": 1440, "height": 1000},
            accept_downloads=True,
        )
        page = context.pages[0]
        page.on("console", lambda msg: console_messages.append({"type": msg.type, "text": msg.text}) if msg.type in {"error", "warning"} else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("requestfailed", lambda request: request_failures.append({"url": request.url, "failure": str(request.failure)}))

        response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)
        wait_app(page)
        require("Local app returns HTTP 200", bool(response and response.status == 200), f"status={response.status if response else 'none'}")
        require("First screen is meaningful", page.get_by_role("button", name="เริ่มตั้งค่า").count() == 1, page.url)
        complete_onboarding(page)
        require("Onboarding reaches Studio HQ", "#/hq" in page.url, page.url)
        page.wait_for_timeout(3200)  # clear onboarding toast for release screenshots

        active_channel = page.locator('select[data-change="active-channel"]')
        active_project = page.locator('select[data-change="active-project"]')
        require("Default Channel Focus is History Lab", active_channel.input_value() == "channel_history_lab", active_channel.input_value())
        require("Default Active Project is Wojtek", active_project.input_value() == "project_wojtek_short", active_project.input_value())
        require("HQ exposes calendar-driven storyboard mission", "Create Wojtek storyboard and shot list" in page.locator("body").inner_text())
        require("HQ desktop has no document overflow", page.evaluate("document.documentElement.scrollWidth === document.documentElement.clientWidth"))
        page.screenshot(path=str(SCREENSHOTS / "v1.1-hq.png"), full_page=True)

        route(page, "mission")
        mission_text = page.locator("body").inner_text()
        require("Mission Control uses Script Approved as current stage", "Current stage\nScript Approved" in mission_text)
        require("Mission Control targets Storyboard", "Target stage\nStoryboard" in mission_text)
        require("Mission Control recommends storyboard", "Recommended tool\nstoryboard" in mission_text)
        require("Mission Control desktop has no document overflow", page.evaluate("document.documentElement.scrollWidth === document.documentElement.clientWidth"))
        page.screenshot(path=str(SCREENSHOTS / "v1.1-mission.png"), full_page=True)

        page.locator('.mission-command-card [data-action="start-mission"]').click()
        wait_app(page)
        require("Start Mission opens project-scoped Storyboard Prompt", "#/prompts" in page.url and "project=project_wojtek_short" in page.url and "type=storyboard" in page.url, page.url)
        require("Prompt type is Storyboard", page.locator('select[name="type"]').input_value() == "storyboard")
        prompt_project_options = page.locator('select[name="project"] option').all_inner_texts()
        require("Prompt project selector is scoped to focused channel", len(prompt_project_options) == 2 and all("Lead Follow-up" not in item for item in prompt_project_options), str(prompt_project_options))
        page.screenshot(path=str(SCREENSHOTS / "v1.1-prompt.png"), full_page=True)

        page.locator("#prompt-response").fill(json.dumps(storyboard_payload, ensure_ascii=False))
        page.locator('[data-action="parse-response"]').click()
        wait_app(page)
        require("Storyboard JSON advances Pipeline", "#/mission" in page.url and page.locator('select[data-change="active-project"]').input_value() == "project_wojtek_short", page.url)
        next_text = page.locator("body").inner_text()
        require("Next mission becomes visual asset prompts", "Prepare visual asset prompts" in next_text)
        require("Project stage becomes Storyboard", "Current stage\nStoryboard" in next_text)
        require("Next target becomes Assets Needed", "Target stage\nAssets Needed" in next_text)
        page.screenshot(path=str(SCREENSHOTS / "v1.1-mission-next.png"), full_page=True)

        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        persisted_text = page.locator("body").inner_text()
        require("Active Project persists after reload", page.locator('select[data-change="active-project"]').input_value() == "project_wojtek_short")
        require("Pipeline stage persists after reload", "Current stage\nStoryboard" in persisted_text)
        require("Calendar-driven next mission persists after reload", "Prepare visual asset prompts" in persisted_text)

        active_channel = page.locator('select[data-change="active-channel"]')
        active_channel.select_option("channel_flowbiz_ai")
        wait_app(page)
        require("Switching Channel Focus selects its project", page.locator('select[data-change="active-project"]').input_value() == "project_ai_boring_task")
        require("Mission Context switches to FlowBiz AI", "FlowBiz AI Minute" in page.locator("body").inner_text())

        route(page, "prompts")
        ai_prompt_options = page.locator('select[name="project"] option').all_inner_texts()
        require("Prompt Studio shows only AI-channel projects in Channel Focus", len(ai_prompt_options) == 1 and "Lead Follow-up" in ai_prompt_options[0], str(ai_prompt_options))
        require("Pipeline recommends Shorts Script for AI project", page.locator('select[name="type"]').input_value() == "shorts-script", page.locator('select[name="type"]').input_value())

        route(page, "mission")
        page.get_by_role("button", name="Rebuild plan").click()
        wait_app(page)
        route(page, "calendar")
        locked_count = page.locator(".calendar-task-card.locked").count()
        unlocked_count = page.locator('.calendar-task-card:not(.locked):not(.done)').count()
        require("Calendar contains an unlocked current mission", unlocked_count >= 1, f"unlocked={unlocked_count}")
        require("Calendar locks future Pipeline missions", locked_count >= 1, f"locked={locked_count}")
        require("Calendar remains scoped to FlowBiz AI", "Channel Focus: FlowBiz AI Minute" in page.locator("body").inner_text())
        page.screenshot(path=str(SCREENSHOTS / "v1.1-calendar.png"), full_page=True)

        page.locator('select[data-change="active-channel"]').select_option("portfolio")
        wait_app(page)
        require("Portfolio Mode is selectable globally", page.locator('select[data-change="active-channel"]').input_value() == "portfolio")
        route(page, "prompts")
        portfolio_options = page.locator('select[name="project"] option').all_inner_texts()
        require("Portfolio Prompt Studio exposes projects across channels", len(portfolio_options) >= 3 and any("Wojtek" in item for item in portfolio_options) and any("Lead Follow-up" in item for item in portfolio_options), str(portfolio_options))

        page.locator('select[data-change="active-channel"]').select_option("channel_history_lab")
        wait_app(page)
        page.locator('select[data-change="active-project"]').select_option("project_wojtek_short")
        wait_app(page)
        require("Channel and project can be refocused after Portfolio Mode", page.locator('select[data-change="active-channel"]').input_value() == "channel_history_lab" and page.locator('select[data-change="active-project"]').input_value() == "project_wojtek_short")

        route(page, "import-export")
        with page.expect_download(timeout=15_000) as download_info:
            page.locator('[data-action="export-workspace"]').first.click()
        download = download_info.value
        export_path = EVIDENCE / "v1.1-workspace-export.json"
        download.save_as(str(export_path))
        exported = json.loads(export_path.read_text(encoding="utf-8"))
        wojtek = next(item for item in exported["projects"] if item["id"] == "project_wojtek_short")
        require("Workspace export uses schema v2", exported.get("schemaVersion") == 2)
        require("Workspace export preserves Channel/Project focus", exported.get("focus", {}).get("activeChannelId") == "channel_history_lab" and exported.get("focus", {}).get("activeProjectId") == "project_wojtek_short", str(exported.get("focus")))
        require("Workspace export preserves advanced Project stage", wojtek.get("status") == "storyboard", wojtek.get("status", ""))
        require("Workspace export preserves workflow history", len(wojtek.get("workflowEvents", [])) >= 3, f"events={len(wojtek.get('workflowEvents', []))}")

        # Keyboard command surface
        route(page, "hq")
        page.keyboard.press("Control+k")
        require("Ctrl+K opens Command Palette", page.locator("#app-dialog").count() == 1 and page.evaluate("document.activeElement?.id === 'command-query'"))
        page.locator('[data-dialog-close]').click()

        # Route matrix and visible control accessibility on desktop.
        for route_name in routes:
            route(page, route_name)
            metrics = route_metrics(page)
            metrics["route"] = route_name
            route_matrix.append(metrics)
            record(f"Desktop route {route_name} renders named surface", bool(metrics["heading"] and not metrics["fatal"]), metrics["heading"])
            record(f"Desktop route {route_name} has no document overflow", metrics["scrollWidth"] == metrics["clientWidth"], f"{metrics['scrollWidth']}/{metrics['clientWidth']}")
            record(f"Desktop route {route_name} has no unnamed visible button", metrics["visibleUnnamedButtons"] == 0, f"count={metrics['visibleUnnamedButtons']}")

        # PWA cache and offline reload.
        route(page, "hq")
        page.evaluate("() => navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false")
        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        controller = page.evaluate("Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)")
        require("Service worker controls the app after reload", controller)
        failures_before_offline = len(request_failures)
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded", timeout=20_000)
        wait_app(page)
        require("PWA reloads Studio HQ offline", "Studio HQ" in page.locator("body").inner_text() and not page.locator(".fatal-error").count())
        context.set_offline(False)
        offline_failures = request_failures[failures_before_offline:]
        record("Offline reload has no uncached critical request failure", len(offline_failures) == 0, str(offline_failures))

        # Mobile portrait checks across every product surface; capture core workflow screens.
        page.set_viewport_size({"width": 390, "height": 844})
        mobile_screenshot_routes = {"hq", "mission", "prompts", "calendar"}
        for route_name in routes:
            route(page, route_name)
            metrics = route_metrics(page)
            metrics["route"] = route_name
            mobile_matrix.append(metrics)
            record(f"Mobile route {route_name} renders named surface", bool(metrics["heading"] and not metrics["fatal"]), metrics["heading"])
            record(f"Mobile route {route_name} has no document overflow", metrics["scrollWidth"] == metrics["clientWidth"], f"{metrics['scrollWidth']}/{metrics['clientWidth']}")
            record(f"Mobile route {route_name} keeps Focus bar visible", page.locator(".focus-mobile-bar").is_visible())
            if route_name in mobile_screenshot_routes:
                page.screenshot(path=str(SCREENSHOTS / f"v1.1-mobile-{route_name}.png"), full_page=True)

        context.close()

    significant_console = [item for item in console_messages if item["type"] == "error"]
    record("Browser console has zero errors", len(significant_console) == 0, str(significant_console))
    record("Browser has zero page errors", len(page_errors) == 0, str(page_errors))

    result = {
        "release": "1.1.0",
        "target": BASE_URL,
        "browser": "Playwright Python with system Chromium",
        "desktopViewport": {"width": 1440, "height": 1000},
        "mobileViewport": {"width": 390, "height": 844},
        "checks": checks,
        "passed": sum(1 for item in checks if item["passed"]),
        "failed": sum(1 for item in checks if not item["passed"]),
        "routeMatrix": route_matrix,
        "mobileMatrix": mobile_matrix,
        "consoleMessages": console_messages,
        "pageErrors": page_errors,
        "requestFailures": request_failures,
    }
    output = EVIDENCE / "V1.1-E2E-RESULTS.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{result['passed']}/{len(checks)} browser checks passed; {result['failed']} failed.")
    print(f"Evidence: {output}")
    return 0 if result["failed"] == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        record("Browser acceptance run completed", False, repr(error))
        result = {
            "release": "1.1.0",
            "target": BASE_URL,
            "browser": "Playwright Python with system Chromium",
            "checks": checks,
            "passed": sum(1 for item in checks if item["passed"]),
            "failed": sum(1 for item in checks if not item["passed"]),
            "routeMatrix": route_matrix,
            "mobileMatrix": mobile_matrix,
            "consoleMessages": console_messages,
            "pageErrors": page_errors,
            "requestFailures": request_failures,
            "fatalError": repr(error),
        }
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        (EVIDENCE / "V1.1-E2E-RESULTS.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        raise
