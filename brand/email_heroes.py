"""
Draw the email header images that only differ by their label card.

Starts from hero-invoice.png (logo, glass background, empty-able card), clears
the card's icon and label, and draws a new icon and label in Geist Bold.
Run from the repo root: python3 brand/email_heroes.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend/public/email"
FONT = ROOT / "frontend/node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf"

TANGERINE = (242, 105, 13)
INK = (20, 20, 20)
RED = (220, 38, 38)
WHITE = (255, 255, 255)

# name: (label, icon colour, glyph)
HEROES = {
    "reminder": ("Meeting reminder", TANGERINE, "clock"),
    "find-time": ("Find a time", TANGERINE, "clock"),
    "week": ("Your week", INK, "calendar"),
    "calendar": ("Calendar needs attention", RED, "alert"),
    "schedule": ("Schedule received", TANGERINE, "calendar"),
    "account": ("Your TimeIQ account", INK, "person"),
}

# Card interior rows and the strip holding the old icon and label (1200x440 image).
Y0, Y1 = 170, 300
X_CLEAR0, X_CLEAR1 = 80, 1120
ICON_C, ICON_R = (130, 235), 32


def clear_label(img: Image.Image) -> None:
    """Replace each row of the label strip with a blend of the card's own edge pixels."""
    px = img.load()
    for y in range(Y0, Y1):
        left, right = px[X_CLEAR0 - 6, y], px[X_CLEAR1 + 6, y]
        span = X_CLEAR1 - X_CLEAR0
        for x in range(X_CLEAR0, X_CLEAR1):
            t = (x - X_CLEAR0) / span
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(left, right))
    # Row-by-row blending leaves faint streaks; a soft blur hides them.
    box = (X_CLEAR0, Y0, X_CLEAR1, Y1)
    img.paste(img.crop(box).filter(ImageFilter.GaussianBlur(4)).crop((8, 8, X_CLEAR1 - X_CLEAR0 - 8, Y1 - Y0 - 8)), (X_CLEAR0 + 8, Y0 + 8))


def draw_icon(d: ImageDraw.ImageDraw, colour, glyph: str) -> None:
    cx, cy = ICON_C
    d.ellipse([cx - ICON_R, cy - ICON_R, cx + ICON_R, cy + ICON_R], fill=colour)
    w = 4
    if glyph == "clock":
        d.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], outline=WHITE, width=w)
        d.line([cx, cy, cx, cy - 9], fill=WHITE, width=w)
        d.line([cx, cy, cx + 8, cy + 4], fill=WHITE, width=w)
    elif glyph == "calendar":
        d.rounded_rectangle([cx - 14, cy - 12, cx + 14, cy + 14], radius=4, outline=WHITE, width=w)
        d.line([cx - 14, cy - 3, cx + 14, cy - 3], fill=WHITE, width=w)
        d.line([cx - 7, cy - 17, cx - 7, cy - 9], fill=WHITE, width=w)
        d.line([cx + 7, cy - 17, cx + 7, cy - 9], fill=WHITE, width=w)
    elif glyph == "alert":
        d.rounded_rectangle([cx - 3, cy - 15, cx + 3, cy + 5], radius=3, fill=WHITE)
        d.ellipse([cx - 4, cy + 9, cx + 4, cy + 17], fill=WHITE)
    elif glyph == "person":
        d.ellipse([cx - 8, cy - 15, cx + 8, cy + 1], fill=WHITE)
        d.pieslice([cx - 15, cy + 4, cx + 15, cy + 34], 180, 360, fill=WHITE)


def main() -> None:
    base = Image.open(OUT / "hero-invoice.png").convert("RGB")
    # The overdue digest keeps the original "Invoice overdue" art under its own name.
    reminder = OUT / "hero-reminder.png"
    overdue = OUT / "hero-overdue.png"
    if not overdue.exists():
        overdue.write_bytes(reminder.read_bytes())
    font = ImageFont.truetype(str(FONT), 40)
    for name, (label, colour, glyph) in HEROES.items():
        img = base.copy()
        clear_label(img)
        d = ImageDraw.Draw(img)
        draw_icon(d, colour, glyph)
        d.text((193, ICON_C[1]), label, font=font, fill=INK, anchor="lm")
        img.save(OUT / f"hero-{name}.png", optimize=True)
        print("wrote", f"hero-{name}.png")


if __name__ == "__main__":
    main()
