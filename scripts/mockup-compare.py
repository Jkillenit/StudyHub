"""Today vs the final mockups: renders Today at 1280x720, shot at 1024x576, with the mockup's data and writes a
side-by-side PNG (app left, mockup right).

Run from the repo root (PowerShell):
  python <main checkout>/.agents/skills/webapp-testing/scripts/with_server.py --server "npx vite --port 5173 --strictPort" --port 5173 --timeout 60 -- python scripts/mockup-compare.py [--v5] [--tag NAME]

  --v5         also finish Problem Set 4 (score set) and shoot mid-stream, against today-final-mockup-v5.jpg
  --tag NAME   suffix for the output files (default "now"), e.g. before / after
  --delay MS   v5 only: ms after the task finishes to take the shot (default 450)
  --assets DIR folder holding today-minimal-mockup-v4.jpg / today-final-mockup-v5.jpg

Needs: pip install playwright && python -m playwright install chromium
Writes %TEMP%/studyhub-mockup/{app,side}-{v4,v5}-<tag>.png and prints the paths.
"""

import argparse
import base64
import json
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

URL = "http://localhost:5173"
W, H = 1024, 576
ASSETS = os.path.join(os.path.expanduser("~"), ".cursor", "projects", "c-Users-jacks-Downloads-StudyHub", "assets")
OUT = os.path.join(tempfile.gettempdir(), "studyhub-mockup")
TZ = "America/Chicago"
# Thursday, October 8 2026, 4:48 PM in Chicago (UTC-5).
NOW = "2026-10-08T21:48:00.000Z"
COMPANION = {"enabled": True, "onboarded": True, "askedName": True, "askedMore": True, "nudges": False}
LINE_V4 = "Exam's in two days. Start there?"

# OM 300 sits at 71% against an 80 (B) target; Exam 2 is 9/13 of the grade, so 71 + 9 / (9/13) = 84 holds it.
DATA = {
    "now": NOW,
    "synced": True,
    "syncedAt": "2026-10-08T21:36:00.000Z",
    "courses": [
        {
            "uuid": "om300", "name": "Operations Management", "courseCode": "OM 300", "targetGrade": 80,
            "cardsTotal": 40, "cardsDue": 0,
            "components": [
                {"uuid": "om-work", "name": "Coursework", "category": "other", "weight": 4, "score": 71},
                {"uuid": "om-ex2", "name": "Exam 2", "category": "exam", "weight": 9, "score": None, "pointsTotal": 100, "itemCount": 1},
            ],
            "assignments": [
                {"uuid": "ex2", "title": "OM 300 Exam 2 prep", "kind": "exam", "dueDate": "2026-10-10T15:00:00.000Z",
                 "score": None, "pointsPossible": 100, "url": None, "componentUuid": "om-ex2"},
            ],
        },
        {
            "uuid": "fin310", "name": "Corporate Finance", "courseCode": "FIN 310", "targetGrade": 80,
            "cardsTotal": 0, "cardsDue": 0, "components": [],
            "assignments": [
                {"uuid": "ps4", "title": "Problem Set 4", "kind": "assignment", "dueDate": "2026-10-10T04:59:00.000Z",
                 "score": None, "pointsPossible": 20, "url": None, "componentUuid": None},
            ],
        },
        {
            "uuid": "mkt300", "name": "Marketing", "courseCode": "MKT 300", "targetGrade": 80,
            "cardsTotal": 0, "cardsDue": 0, "components": [],
            "assignments": [
                # The mockup says "Fri", but with Problem Set 4 due "tomorrow" on a Thursday, Fri can't also be a weekday label.
                {"uuid": "ch9", "title": "Read Chapter 9", "kind": "assignment", "dueDate": "2026-10-14T04:59:00.000Z",
                 "score": None, "pointsPossible": 10, "url": None, "componentUuid": None},
            ],
        },
    ],
}

INIT = """
window.__todayData = %s;
window.studyHub = { db: { today: { get: async () => window.__todayData } } };
localStorage.setItem('companion.state', %s);
localStorage.setItem('studyHub.v2.ui.arrivalDay', JSON.stringify('2026-10-08'));
""" % (json.dumps(DATA), json.dumps(json.dumps(COMPANION)))

SIDE = """<!doctype html><html><body style="margin:0;background:#111;display:flex;gap:8px;font:12px monospace;color:#aaa">
<figure style="margin:0"><img src="data:image/png;base64,%s" width="%d" height="%d" style="display:block"><figcaption>app</figcaption></figure>
<figure style="margin:0"><img src="data:image/jpeg;base64,%s" width="%d" height="%d" style="display:block"><figcaption>mockup</figcaption></figure>
</body></html>"""


def side_by_side(browser, app_png, mockup_path, out_path):
    with open(mockup_path, "rb") as f:
        mock = base64.b64encode(f.read()).decode()
    page = browser.new_page(viewport={"width": W * 2 + 8, "height": H + 18})
    page.set_content(SIDE % (base64.b64encode(app_png).decode(), W, H, mock, W, H))
    page.wait_for_function("[...document.images].every((i) => i.complete)")
    page.screenshot(path=out_path)
    page.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--v5", action="store_true")
    ap.add_argument("--tag", default="now")
    ap.add_argument("--delay", type=int, default=450)
    ap.add_argument("--assets", default=ASSETS)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    errors = []

    with sync_playwright() as p:
        # Real GPU on Windows, or the field and Nova don't render.
        gpu = ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11"] if sys.platform == "win32" else []
        browser = p.chromium.launch(headless=True, args=gpu)
        # The mockups are a 1280x720 window shown at 1024x576.
        ctx = browser.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=W / 1280, timezone_id=TZ)
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        page.clock.set_fixed_time(NOW)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)

        page.goto(URL)
        page.wait_for_selector(".sh-setup-done", timeout=30000)
        page.click(".sh-setup-done")
        page.wait_for_selector(".sh-home-row", timeout=15000)
        page.wait_for_selector(".sc-scout--3d:not(.sc-scout--loading):not(.sc-scout--hidden)", timeout=30000)
        page.wait_for_timeout(2500)
        page.evaluate("(text) => window.dispatchEvent(new CustomEvent('studyhub-companion-greet', { detail: { text } }))", LINE_V4)
        page.wait_for_selector(".sc-bubble", timeout=5000)
        page.wait_for_timeout(1500)
        shots = [("v4", page.screenshot(), "today-minimal-mockup-v4.jpg")]

        if args.v5:
            page.evaluate("""() => {
              const d = structuredClone(window.__todayData);
              d.courses[1].assignments[0].score = 18;
              window.__todayData = d;
              window.dispatchEvent(new CustomEvent('studyhub-mirror-changed'));
            }""")
            page.wait_for_timeout(args.delay)
            shots.append(("v5", page.screenshot(), "today-final-mockup-v5.jpg"))

        for name, png, mock in shots:
            app_path = os.path.join(OUT, f"app-{name}-{args.tag}.png")
            with open(app_path, "wb") as f:
                f.write(png)
            side_path = os.path.join(OUT, f"side-{name}-{args.tag}.png")
            side_by_side(browser, png, os.path.join(args.assets, mock), side_path)
            print(side_path)
        browser.close()

    if errors:
        print("page/console errors:")
        for e in errors:
            print(f"  {e}")


if __name__ == "__main__":
    main()
