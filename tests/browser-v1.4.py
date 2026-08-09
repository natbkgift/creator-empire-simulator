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


def unnamed_form_control_count(page) -> int:
    return page.locator('form input:not([type="hidden"]), form select, form textarea').evaluate_all(
        "els => els.filter((el) => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length"
    )


def contrast_ratio(page, text_selector: str, background_selector: str) -> float:
    return float(page.evaluate(
        """([textSelector, backgroundSelector]) => {
          const parse = (value) => value.match(/[\\d.]+/g).slice(0, 3).map(Number);
          const luminance = (rgb) => {
            const linear = rgb.map((channel) => {
              const value = channel / 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
          };
          const foreground = luminance(parse(getComputedStyle(document.querySelector(textSelector)).color));
          const background = luminance(parse(getComputedStyle(document.querySelector(backgroundSelector)).backgroundColor));
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        }""",
        [text_selector, background_selector],
    ))


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
        nav_font_size = float(
            page.locator(".side-rail .nav-label")
            .first.evaluate("el => parseFloat(getComputedStyle(el).fontSize)")
        )
        record("Sidebar navigation typography is readable", nav_font_size >= 15, f"{nav_font_size:g}px")
        record("Today remains mission-first", page.locator(".mission-deck").count() == 1 and page.locator(".mission-title").count() == 1)
        bg = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
        record("Editorial Dark token is active", bg.lower() == "#080c14", bg)
        body_font = float(page.evaluate("parseFloat(getComputedStyle(document.body).fontSize)"))
        record("Base typography is readable", body_font >= 15, f"{body_font}px")

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
        production_overflow = page.evaluate("document.querySelector('#main-content').scrollWidth > document.querySelector('#main-content').clientWidth")
        record("Production fits the desktop content viewport", not production_overflow)
        production_title_font = float(page.locator(".flow-video-card h3").first.evaluate("el => parseFloat(getComputedStyle(el).fontSize)"))
        record("Production card titles remain readable", production_title_font >= 14, f"{production_title_font}px")

        page.goto(f"{BASE_URL}/#/analytics", wait_until="domcontentloaded")
        wait_app(page)
        record("Insights uses two featured KPIs", page.locator(".featured-insights .metric-card").count() == 2)
        record("Insights has one dominant chart", page.locator(".dominant-insight-chart").count() == 1)
        record("Recent Publishes table exists", page.locator(".recent-publishes table").count() == 1)
        record("Insights form controls have accessible names", unnamed_form_control_count(page) == 0)

        page.goto(f"{BASE_URL}/#/calendar", wait_until="domcontentloaded")
        wait_app(page)
        calendar_contrast = contrast_ratio(page, ".day-head b", ".day-column")
        record("Desktop Calendar normal text contrast passes AA", calendar_contrast >= 4.5, f"{calendar_contrast:.2f}:1")
        record("Calendar form controls have accessible names", unnamed_form_control_count(page) == 0)

        page.goto(f"{BASE_URL}/#/settings", wait_until="domcontentloaded")
        wait_app(page)
        record("Settings route has the correct document title", page.title().startswith("Settings ·"), page.title())
        record("Settings form controls have accessible names", unnamed_form_control_count(page) == 0)

        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE_URL}/#/calendar", wait_until="domcontentloaded")
        wait_app(page)
        record("Mobile uses compact context header", page.locator(".focus-mobile-bar").is_visible())
        record("Mobile keeps five bottom destinations", page.locator(".mobile-bottom .mobile-nav").count() == 5)
        record("Mobile calendar switches to single-day view", page.locator(".calendar-mobile-day").is_visible())
        record("Desktop week grid is hidden on mobile", not page.locator(".desktop-week-calendar").is_visible())
        overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        record("No document-level mobile horizontal overflow", not overflow)
        day_target = page.locator(".mobile-day-nav > a").first.bounding_box()
        record("Mobile Calendar navigation meets touch target guidance", bool(day_target and day_target["width"] >= 44 and day_target["height"] >= 44), str(day_target))

        page.goto(f"{BASE_URL}/#/production", wait_until="domcontentloaded")
        wait_app(page)
        mobile_columns = page.locator(".production-flow-board").evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
        record("Mobile Production uses a discoverable single-column flow", mobile_columns == 1, str(mobile_columns))
        production_mobile_overflow = page.evaluate("document.querySelector('#main-content').scrollWidth > document.querySelector('#main-content').clientWidth")
        record("Mobile Production has no content scroll trap", not production_mobile_overflow)

        real_errors = [e for e in console_errors if "net::ERR_FAILED" not in e and "ERR_CONNECTION" not in e and "fonts.googleapis.com" not in e]
        record("No application console errors", not real_errors, " | ".join(real_errors[:3]))

        context.close()
        browser.close()

    print(f"\n{sum(1 for item in checks if item['passed'])}/{len(checks)} v1.4 browser checks passed.")


if __name__ == "__main__":
    main()
