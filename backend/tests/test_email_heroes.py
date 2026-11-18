from pathlib import Path

from app.services.email_templates import HEROES

EMAIL_ASSETS = Path(__file__).resolve().parents[2] / "frontend/public/email"


def test_every_email_header_has_its_image():
    missing = [h for h in HEROES if not (EMAIL_ASSETS / f"hero-{h}.png").exists()]
    assert missing == []
