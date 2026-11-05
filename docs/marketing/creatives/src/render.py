"""Render the HTML ad templates to PNG.

Usage (from anywhere): python3 docs/marketing/creatives/src/render.py
Writes ad-{A,B,C,G,H,I,J}-*-1080.png plus the free-to-start set (FREE) (square) and -1080x1920.png (Reels/Stories) next to this folder.
Needs the frontend node_modules (Geist font) and system Chrome; Playwright's bundled browser is not required.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
ADS = {"A": "price-shock", "B": "timesheet", "C": "founder-spots", "G": "all-calendars", "H": "no-upsells", "I": "cc-timeiq", "J": "forward-schedule"}
# Free-to-start set (2026-11-04): same layouts with a "Free to start" pill, plus the K offer card.
FREE = {"K": "free-meetings", "G": "all-calendars-free", "I": "cc-timeiq-free", "J": "forward-schedule-free"}
SIZES = {1080: "1080", 1920: "1080x1920"}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1080, "height": 1920})
    jobs = [(k, s, "") for k, s in ADS.items()] + [(k, s, "Free to start") for k, s in FREE.items()]
    for key, slug, pill in jobs:
        for h, suffix in SIZES.items():
            page.goto(f"{(HERE / 'ad.html').as_uri()}?ad={key}&h={h}" + (f"&pill={pill}" if pill else ""))
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            out = OUT / f"ad-{key}-{slug}-{suffix}.png"
            page.locator("#ad").screenshot(path=str(out))
            print(out.name)
    browser.close()
