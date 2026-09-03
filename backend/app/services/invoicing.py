from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal("0.01")
QUARTER = Decimal("0.25")


def line_amount(hours: Decimal, rate: Decimal) -> Decimal:
    """Hours times rate, rounded half-up to cents."""
    return (Decimal(hours) * Decimal(rate)).quantize(CENTS, rounding=ROUND_HALF_UP)


def format_invoice_number(n: int) -> str:
    return f"INV-{n:04d}"


def duration_to_hours(starts_at: datetime, ends_at: datetime) -> Decimal:
    """Event duration as hours rounded to the nearest quarter hour, minimum 0.25."""
    minutes = Decimal((ends_at - starts_at).total_seconds()) / Decimal(60)
    quarters = (minutes / Decimal(60) / QUARTER).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    hours = quarters * QUARTER
    if hours < QUARTER:
        hours = QUARTER
    return hours.quantize(CENTS)


def parse_keywords(raw: str | None) -> list[str]:
    """Split a comma-separated keyword string into unique lowercase keywords."""
    if not raw:
        return []
    seen: list[str] = []
    for part in raw.split(","):
        kw = part.strip().lower()
        if kw and kw not in seen:
            seen.append(kw)
    return seen


def title_matches(title: str | None, keywords: list[str]) -> bool:
    if not title or not keywords:
        return False
    lowered = title.lower()
    return any(kw in lowered for kw in keywords)
