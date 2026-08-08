#!/usr/bin/env python3
"""Creator Empire v1.4 frozen-design browser acceptance checks."""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("CREATOR_EMPIRE_URL", "http://127.0.0.1:4173").rstrip("/")
CHROMIUM = os.environ.get("CHROMIUM_PATH")
checks: list[dict[str, Any]] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    checks.append({"name": name, "passed": bool(passed), "detail": detail})
    print(("PASS" if passed else "FAIL"), name, f"— {detail}" if detail else "")
    if not passed:
        raise AssertionError(f"{name}: {detail}")


def api(path: str, method: str = "GET", payload: dict | None = None) -> dict:
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE_URL + path, data=body, method=method, headers={"Content-Type": "application/json"} if body else {})
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode())


def wait_app(page) -> None:
    page.wait_for_selector("#app", state="attached")
    page.wait_for_timeout(350)


def main() -> None:
    launch_args: dict[str, Any] = {"headless": True}
    if CHROMIUM:
        launch_args["executable_path"] = CHROMIUM
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        console_errors: list[str] = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        state = api("/api/workspace")
        workspace = state.get("workspace")
        if workspace:
            workspace["settings"]["onboardingComplete"] = True
            api("/api/workspace", "PUT", {"workspace": workspace})

        page.goto(f"{BASE_URL}/#/hq", wait_until="domcontentloaded")
        wait_app(page)
        record("Editorial global command header is present", page.locator(".global-command-header").count() == 1)
        record("Global search control is present", page.locator(".global-search").count() == 1)
        labels = page.locator(".side-rail .nav-label").all_inner_texts()
        record("Frozen five-area navigation order", labels == ["Today", "Channels", "Production", "Calendar", "Insights"], str(labels))
        record("Today remains mission-first", page.locator(".mission-deck").count() == 1 and page.locator(".mission-title").count() == 1)
        bg = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
        record("Editorial Dark token is active", bg.lower() == "#080c14", bg)

        page.keyboard.press("Control+k")
        page.wait_for_selector("#app-dialog")
        record("Ctrl/Cmd+K opens global command palette", "Search or jump" in page.locator("#app-dialog").inner_text())
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)

        page.goto(f"{BASE_URL}/#/blueprint?portfolio=1", wait_until="domcontentloaded")
        wait_app(page)
        record("Channels opens portfolio level", page.locator(".channel-portfolio-card").count() > 0)
        page.locator(".channel-portfolio-card").first.click()
        page.wait_for_selector(".channel-workspace-hero")
        wait_app(page)
        body = page.locator("#main-content").inner_text()
        record("Channel Workspace opens from portfolio", "Channel Blueprint" in body or "Channel Workspace" in body or "CHANNEL BLUEPRINT" in body)
        record("Originality & Sources restored", "Originality & Sources" in body or "ORIGINALITY & SOURCES" in body or "Originality" in body)
        record("Monetization restored contextually", "Monetization" in body or "MONETIZATION" in body)
        record("30-Day Content Plan restored", "30-Day Content Plan" in body or "30-DAY CONTENT PLAN" in body)
        record("Channel focus updates global header", page.locator('.command-channel select').input_value() != "portfolio")
        page.locator(".plan-title-button").first.click()
        page.wait_for_selector("#plan-idea-form")
        record("Idea detail can create real video plan", page.locator('#plan-idea-form input[name="deadline"][type="datetime-local"]').count() == 1)
        page.locator("#app-dialog [data-dialog-close]").click()

        page.goto(f"{BASE_URL}/#/production", wait_until="domcontentloaded")
        wait_app(page)
        record("Production uses seven visual groups", page.locator(".production-flow-board .flow-group").count() == 7)
        group_labels = [g.capitalize() for g in page.locator(".flow-group-head > div > span").all_inner_texts()]
        record("Production group order is frozen", group_labels == ["Idea", "Research", "Script", "Production", "Edit", "Release", "Growth"], str(group_labels))
        record("Growth Loop is visibly separate", page.locator(".growth-loop-note").count() == 1)

        page.goto(f"{BASE_URL}/#/analytics", wait_until="domcontentloaded")
        wait_app(page)
        record("Insights uses two featured KPIs", page.locator(".featured-insights .metric-card").count() == 2)
        record("Insights has one dominant chart", page.locator(".dominant-insight-chart").count() == 1)
        record("Recent Publishes table exists", page.locator(".recent-publishes table").count() == 1)

        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE_URL}/#/calendar", wait_until="domcontentloaded")
        wait_app(page)
        record("Mobile uses compact context header", page.locator(".focus-mobile-bar").is_visible())
        record("Mobile keeps five bottom destinations", page.locator(".mobile-bottom .mobile-nav").count() == 5)
        record("Mobile calendar switches to single-day view", page.locator(".calendar-mobile-day").is_visible())
        record("Desktop week grid is hidden on mobile", not page.locator(".desktop-week-calendar").is_visible())
        overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        record("No document-level mobile horizontal overflow", not overflow)

        real_errors = [e for e in console_errors if "net::ERR_FAILED" not in e and "ERR_CONNECTION" not in e and "fonts.googleapis.com" not in e]
        record("No application console errors", not real_errors, " | ".join(real_errors[:3]))

        context.close()
        browser.close()

    print(f"\n{sum(1 for item in checks if item['passed'])}/{len(checks)} v1.4 browser checks passed.")


if __name__ == "__main__":
    main()
