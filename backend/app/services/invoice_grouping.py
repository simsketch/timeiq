"""Presentation grouping for invoice lines.

Invoices store one line per time entry so the underlying data stays faithful,
but a client reading twenty-six rows of "work" learns nothing. These helpers
collapse time lines by description, summarise the period week by week, and keep
expense lines separate. Mirrored in frontend/src/lib/invoice-grouping.ts — change
both together.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Iterable, NamedTuple

KIND_TIME = "time"
KIND_EXPENSE = "expense"


class GroupedLine(NamedTuple):
    description: str
    first_date: date
    last_date: date
    hours: Decimal
    rate: Decimal
    amount: Decimal


class WeekRow(NamedTuple):
    week_start: date
    week_end: date
    hours: Decimal
    amount: Decimal
    # Hours per day, Sunday first, for the day-by-day grid.
    days: tuple[Decimal, ...] = (Decimal("0"),) * 7


def _dec(value: Any) -> Decimal:
    return Decimal(value or 0)


def is_expense(line: Any) -> bool:
    return getattr(line, "kind", KIND_TIME) == KIND_EXPENSE


def split_lines(lines: Iterable[Any]) -> tuple[list[Any], list[Any]]:
    """Separate billable time from expenses, preserving order within each."""
    time_lines, expense_lines = [], []
    for line in lines:
        (expense_lines if is_expense(line) else time_lines).append(line)
    return time_lines, expense_lines


def group_time_lines(lines: Iterable[Any]) -> list[GroupedLine]:
    """Collapse time lines sharing a description and rate into one row each.

    Descriptions are matched case- and whitespace-insensitively; the first
    spelling encountered is the one displayed. Rows come back in the order the
    work first appears, so the invoice still reads chronologically.
    """
    groups: dict[tuple[str, Decimal], dict[str, Any]] = {}
    for line in lines:
        if is_expense(line):
            continue
        rate = _dec(getattr(line, "rate", 0))
        key = (" ".join(line.description.split()).lower(), rate)
        hours = _dec(line.hours)
        amount = _dec(line.amount)
        existing = groups.get(key)
        if existing is None:
            groups[key] = {
                "description": line.description.strip(),
                "first_date": line.line_date,
                "last_date": line.line_date,
                "hours": hours,
                "rate": rate,
                "amount": amount,
            }
        else:
            existing["hours"] += hours
            existing["amount"] += amount
            existing["first_date"] = min(existing["first_date"], line.line_date)
            existing["last_date"] = max(existing["last_date"], line.line_date)
    rows = [GroupedLine(**g) for g in groups.values()]
    rows.sort(key=lambda r: (r.first_date, r.description.lower()))
    return rows


def week_start_for(day: date) -> date:
    """Sunday that begins the week containing `day`, matching the timesheet grid."""
    return day - timedelta(days=(day.weekday() + 1) % 7)


def weekly_breakdown(lines: Iterable[Any]) -> list[WeekRow]:
    """Hours and value per Sunday-to-Saturday week, so a 40-hour week is visible."""
    weeks: dict[date, dict[str, Any]] = {}
    for line in lines:
        if is_expense(line):
            continue
        start = week_start_for(line.line_date)
        bucket = weeks.setdefault(
            start,
            {"hours": Decimal("0"), "amount": Decimal("0"), "days": [Decimal("0")] * 7},
        )
        hours = _dec(line.hours)
        bucket["hours"] += hours
        bucket["amount"] += _dec(line.amount)
        bucket["days"][(line.line_date - start).days] += hours
    return [
        WeekRow(start, start + timedelta(days=6), v["hours"], v["amount"], tuple(v["days"]))
        for start, v in sorted(weeks.items())
    ]


def totals(lines: Iterable[Any]) -> dict[str, Decimal]:
    """Hours, time value, expense value, and grand total for a set of lines."""
    time_lines, expense_lines = split_lines(lines)
    hours = sum((_dec(l.hours) for l in time_lines), Decimal("0"))
    time_amount = sum((_dec(l.amount) for l in time_lines), Decimal("0"))
    expense_amount = sum((_dec(l.amount) for l in expense_lines), Decimal("0"))
    return {
        "hours": hours,
        "time_amount": time_amount,
        "expense_amount": expense_amount,
        "total": time_amount + expense_amount,
    }
