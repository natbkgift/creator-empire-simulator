#!/usr/bin/env python3
"""Browser E2E for v1.3 UX plus SQLite↔IndexedDB recovery."""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

from playwright.sync_api import Page, sync_playwright

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
    req = urllib.request.Request(
        BASE_URL + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode())


def set_idb_workspace(page: Page, workspace: dict) -> None:
    page.evaluate(
        """async (workspace) => {
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('creator-empire-simulator', 1);
            req.onupgradeneeded = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', {keyPath:'id'});
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          await new Promise((resolve, reject) => {
            const tx = db.transaction('workspaces','readwrite');
            tx.objectStore('workspaces').put(workspace);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        }""",
        workspace,
    )


def wait_app(page: Page) -> None:
    page.wait_for_selector("#app", state="attached")
    page.wait_for_timeout(450)


def main() -> None:
    launch_args = {"headless": True}
    if CHROMIUM:
        launch_args["executable_path"] = CHROMIUM
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        console_errors: list[str] = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.goto(f"{BASE_URL}/#/onboarding", wait_until="domcontentloaded")
        wait_app(page)

        # Ensure a seed workspace has been durably written, then bypass onboarding without relying on copy text.
        saved = None
        for _ in range(20):
            payload = api("/api/workspace")
            if payload.get("workspace"):
                saved = payload
                break
            page.wait_for_timeout(100)
        record("seed workspace persisted", saved is not None)
        workspace = saved["workspace"]
        workspace["settings"]["onboardingComplete"] = True
        api("/api/workspace", "PUT", {"workspace": workspace})
        page.goto(f"{BASE_URL}/#/hq", wait_until="domcontentloaded")
        page.wait_for_selector(".side-rail .nav-dot")
        wait_app(page)

        record("five persistent navigation destinations", page.locator(".side-rail .nav-dot").count() == 5)
        labels = page.locator(".side-rail .nav-dot span").all_inner_texts()
        record("navigation is task-oriented", labels == ["Today", "Channels", "Calendar", "Production", "Insights"], str(labels))
        record("Today exposes next mission", page.locator("text=Start").count() > 0 or page.locator("text=Next").count() > 0)

        page.goto(f"{BASE_URL}/#/calendar", wait_until="domcontentloaded")
        page.wait_for_selector(".calendar-layout")
        wait_app(page)
        record("Calendar has exact publish reschedule", page.locator('form[data-form="reschedule-project"] input[type="datetime-local"]').count() == 1)
        record("Calendar displays capacity plan", page.locator("text=Capacity").count() > 0)

        page.goto(f"{BASE_URL}/#/settings", wait_until="domcontentloaded")
        page.wait_for_selector(".panel")
        wait_app(page)
        body = page.locator("body").inner_text()
        record("AI mode is labelled AI Assisted", "AI Assisted" in body)
        record("credentials explain non-SQLite persistence", "Session-only API key" in body and "Environment Variable" in body)
        record("AI budgets are exposed", "Daily budget USD" in body and "Max output tokens" in body)

        # Dual-storage reconciliation: higher IndexedDB revision wins and is written back to SQLite.
        server_state = api("/api/workspace")
        newer = server_state["workspace"]
        server_revision = int(server_state["storage"]["revision"])
        newer["revision"] = server_revision + 5
        newer["name"] = "IDB newer recovery marker"
        newer["updatedAt"] = "2099-01-01T00:00:00.000Z"
        set_idb_workspace(page, newer)
        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        reconciled = api("/api/workspace")
        record("newer IndexedDB revision reconciles into SQLite", reconciled["workspace"]["name"] == "IDB newer recovery marker")
        record("reconciled revision is monotonic", int(reconciled["storage"]["revision"]) >= server_revision + 5)

        # Equal-revision tie: updatedAt is the tie-breaker and must also reconcile, not merely render from cache.
        tie = api("/api/workspace")
        tie_copy = tie["workspace"]
        tie_copy["revision"] = int(tie["storage"]["revision"])
        tie_copy["name"] = "IDB equal-revision newer-time marker"
        tie_copy["updatedAt"] = "2099-01-15T00:00:00.000Z"
        set_idb_workspace(page, tie_copy)
        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        tie_reconciled = api("/api/workspace")
        record("equal revision uses newer updatedAt and reconciles durably", tie_reconciled["workspace"]["name"] == "IDB equal-revision newer-time marker")

        # SQLite outage: abort workspace API so bootstrap must use IndexedDB. Then reconnect and verify recovery.
        page.route("**/api/workspace", lambda route: route.abort())
        offline = tie_reconciled["workspace"]
        offline["revision"] = int(tie_reconciled["storage"]["revision"]) + 5
        offline["name"] = "offline browser recovery marker"
        offline["updatedAt"] = "2099-02-01T00:00:00.000Z"
        set_idb_workspace(page, offline)
        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        record("app boots from IndexedDB during SQLite outage", page.locator("#app").inner_text().strip() != "")
        page.unroute("**/api/workspace")
        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        recovered = api("/api/workspace")
        record("offline IndexedDB work reconciles after SQLite recovery", recovered["workspace"]["name"] == "offline browser recovery marker")

        # Mobile contract.
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE_URL}/#/hq", wait_until="domcontentloaded")
        wait_app(page)
        overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        record("mobile has no horizontal document overflow", not overflow)
        record("mobile nav keeps five destinations", page.locator(".mobile-bottom .mobile-nav").count() == 5)
        real_errors = [e for e in console_errors if "net::ERR_FAILED" not in e and "ERR_CONNECTION" not in e]
        record("no browser console errors", not real_errors, " | ".join(real_errors[:3]))

        context.close()
        browser.close()

    print(f"\n{sum(1 for item in checks if item['passed'])}/{len(checks)} browser checks passed.")


if __name__ == "__main__":
    main()
