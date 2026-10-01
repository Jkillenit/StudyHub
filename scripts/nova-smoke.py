"""Nova smoke test: load, menu, Ask Nova + focus, quiz, drag, toggle.

Run from the repo root (PowerShell):
  $env:PYTHONIOENCODING="utf-8"; python .agents/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 --timeout 60 -- python scripts/nova-smoke.py

Needs: pip install playwright && python -m playwright install chromium

Prints `nova smoke ok` and exits 0 on success. On failure prints the failing
check's name and exits 1. Screenshots go to %TEMP%/nova-smoke-<name>.png.
"""

import json
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

URL = "http://localhost:5173"
STATE = {"enabled": True, "onboarded": True, "askedName": True, "askedMore": True, "nudges": False}

SCOUT = ".sc-scout:not(.sc-scout--hidden)"
SCOUT_BTN = ".sc-scout:not(.sc-scout--hidden) .sc-scout-btn"
MENU = ".sc-menu"
QUIZ = ".sc-quiz"
SETTINGS = ".sc-settings"

errors = []


def shot(page, name):
    page.screenshot(path=os.path.join(tempfile.gettempdir(), f"nova-smoke-{name}.png"))


def fail(page, name, msg):
    print(f"FAIL {name}: {msg}")
    try:
        shot(page, f"{name}-fail")
    except Exception:
        pass
    if errors:
        print("collected errors:")
        for e in errors:
            print(f"  {e}")
    sys.exit(1)


def center(page, selector):
    box = page.locator(selector).bounding_box()
    if not box:
        return None
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def click_center(page, selector):
    c = center(page, selector)
    if c is None:
        raise RuntimeError(f"{selector} has no bounding box")
    page.mouse.click(*c)


def open_menu(page):
    """Clicks Nova until the radial menu opens. She ignores clicks while greeting or mid-move,
    so retry a few times; the 2.5 s spacing stays under the 4-clicks-in-3-s spam guard."""
    for _ in range(4):
        click_center(page, SCOUT_BTN)
        try:
            page.wait_for_selector(MENU, state="visible", timeout=2500)
            return
        except Exception:
            continue
    raise RuntimeError("radial menu did not open after 4 clicks")


def check_load(page):
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_selector(SCOUT, state="visible", timeout=15000)


def check_onboard(page):
    """In a plain browser there is no window.studyHub, so companion state (read from the
    settings bridge, not localStorage) starts at defaults and Nova runs first-launch onboarding.
    Click through it: skip name, skip birthday, nothing to avoid, decline the tour."""
    for label in ["SKIP", "SKIP", "NOTHING, BRING IT", "I'VE GOT IT"]:
        btn = page.locator(".sc-bubble-btn", has_text=label).first
        btn.wait_for(state="visible", timeout=15000)
        btn.click()
    page.wait_for_selector(".sc-bubble-btn", state="detached", timeout=10000)


def check_menu(page):
    open_menu(page)
    page.keyboard.press("Escape")
    page.wait_for_selector(MENU, state="detached", timeout=5000)


def check_ask(page):
    page.keyboard.press("Control+j")
    inp = page.wait_for_selector(".sc-help-input", state="visible", timeout=5000)
    inp.fill("focus 5")
    inp.press("Enter")
    pill = page.wait_for_selector(".sc-focus-pill", state="visible", timeout=5000)
    text = (pill.text_content() or "").strip()
    if not text.startswith("FOCUS"):
        raise RuntimeError(f"focus pill text is {text!r}, expected it to start with FOCUS")
    pill.click()
    page.wait_for_selector(".sc-focus-pill", state="detached", timeout=5000)


def check_quiz(page):
    page.wait_for_function(
        "() => !document.querySelector('.sc-help-input')", timeout=10000
    )
    open_menu(page)
    page.locator(f"{MENU} .sc-menu-item", has_text="QUIZ ME").click()
    page.wait_for_selector(QUIZ, state="visible", timeout=5000)
    page.locator(f'{QUIZ} [aria-label="Close quiz"]').click()
    page.wait_for_selector(QUIZ, state="detached", timeout=5000)


def check_drag(page):
    page.wait_for_timeout(1500)
    start = center(page, SCOUT)
    if start is None:
        raise RuntimeError("Nova has no bounding box")
    x, y = start
    # She lives in the Today home panel on the left; a drop still over it re-houses her
    # in place, so move 250 px toward the window's middle instead of always left.
    dx = 250 if x < 700 else -250
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y - 120, steps=10)
    page.mouse.up()
    page.wait_for_timeout(1500)
    end = center(page, SCOUT)
    if end is None:
        raise RuntimeError("Nova disappeared after the drag")
    moved = ((end[0] - x) ** 2 + (end[1] - y) ** 2) ** 0.5
    if moved <= 50:
        raise RuntimeError(f"Nova moved {moved:.0f}px, expected more than 50px (start {start}, end {end})")


def settings_show_nova(page):
    return page.locator(f"{SETTINGS} .sc-set-row--toggle", has_text="SHOW NOVA").locator(".sc-set-check")


def check_toggle(page):
    open_menu(page)
    page.locator(f"{MENU} .sc-menu-gear").click()
    page.wait_for_selector(SETTINGS, state="visible", timeout=5000)
    box = settings_show_nova(page)
    if not box.is_checked():
        raise RuntimeError("SHOW NOVA is unchecked while Nova is visible")
    box.uncheck()
    page.wait_for_selector(SCOUT, state="detached", timeout=5000)
    box.check()
    page.wait_for_selector(SCOUT, state="visible", timeout=15000)
    page.locator(f'{SETTINGS} [aria-label="Close settings"]').click()
    page.wait_for_selector(SETTINGS, state="detached", timeout=5000)


CHECKS = [
    ("load", check_load),
    ("onboard", check_onboard),
    ("menu", check_menu),
    ("ask", check_ask),
    ("quiz", check_quiz),
    ("drag", check_drag),
    ("toggle", check_toggle),
]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.add_init_script(f"window.localStorage.setItem('companion.state', {json.dumps(json.dumps(STATE))});")
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)

        for name, fn in CHECKS:
            print(f"check: {name}")
            try:
                fn(page)
            except Exception as e:
                fail(page, name, e)
            shot(page, name)

        browser.close()

    if errors:
        print("FAIL errors: collected page/console errors:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    print("nova smoke ok")


if __name__ == "__main__":
    main()
