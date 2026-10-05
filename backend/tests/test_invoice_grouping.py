from datetime import date
from decimal import Decimal
from types import SimpleNamespace as NS

from app.services.invoice_grouping import (
    group_time_lines,
    split_lines,
    totals,
    week_start_for,
    weekly_breakdown,
)


def line(d, desc, hours, amount, kind="time", rate="100.00"):
    return NS(line_date=d, description=desc, hours=Decimal(hours), rate=Decimal(rate),
              amount=Decimal(amount), kind=kind)


def sample():
    return [
        line(date(2026, 8, 31), "phone calls", "2", "200"),
        line(date(2026, 9, 1), "meetings, repository setup", "8", "800"),
        line(date(2026, 9, 2), "meetings, repository setup", "8", "800"),
        line(date(2026, 9, 3), "  Meetings, Repository Setup ", "2", "200"),
        line(date(2026, 9, 3), "phone calls", "2", "200"),
        line(date(2026, 9, 7), "work", "8", "800"),
        line(date(2026, 9, 8), "work", "8", "800"),
        line(date(2026, 9, 14), "work", "8", "800"),
        line(date(2026, 1, 5), "Claude Max subscription", "0", "200", kind="expense", rate="0"),
    ]


def test_groups_by_description_ignoring_case_and_spacing():
    rows = group_time_lines(sample())
    assert [r.description for r in rows] == ["phone calls", "meetings, repository setup", "work"]
    meetings = rows[1]
    assert meetings.hours == Decimal("18")
    assert meetings.amount == Decimal("1800")
    assert meetings.first_date == date(2026, 9, 1)
    assert meetings.last_date == date(2026, 9, 3)


def test_grouping_excludes_expenses_and_orders_by_first_date():
    rows = group_time_lines(sample())
    assert all("Claude" not in r.description for r in rows)
    assert [r.first_date for r in rows] == sorted(r.first_date for r in rows)


def test_separate_rates_do_not_merge():
    rows = group_time_lines([
        line(date(2026, 9, 1), "work", "2", "200", rate="100.00"),
        line(date(2026, 9, 2), "work", "2", "300", rate="150.00"),
    ])
    assert len(rows) == 2


def test_week_start_is_sunday():
    assert week_start_for(date(2026, 9, 9)) == date(2026, 9, 6)   # Wed -> Sun
    assert week_start_for(date(2026, 9, 6)) == date(2026, 9, 6)   # Sun -> itself
    assert week_start_for(date(2026, 9, 12)) == date(2026, 9, 6)  # Sat -> Sun


def test_weekly_breakdown_buckets_and_sorts():
    weeks = weekly_breakdown(sample())
    assert [w.week_start for w in weeks] == [date(2026, 8, 30), date(2026, 9, 6), date(2026, 9, 13)]
    assert weeks[0].hours == Decimal("22")   # Aug 31 + Sep 1-3
    assert weeks[1].hours == Decimal("16")   # Sep 7, 8
    assert weeks[0].week_end == date(2026, 9, 5)


def test_totals_separate_time_from_expenses():
    t = totals(sample())
    assert t["hours"] == Decimal("46")
    assert t["time_amount"] == Decimal("4600")
    assert t["expense_amount"] == Decimal("200")
    assert t["total"] == Decimal("4800")


def test_split_lines():
    time_lines, expenses = split_lines(sample())
    assert len(time_lines) == 8 and len(expenses) == 1


def test_weekly_breakdown_spreads_hours_across_days():
    lines = [
        line(date(2026, 9, 6), "work", "2", "200"),   # Sunday
        line(date(2026, 9, 7), "work", "8", "800"),   # Monday
        line(date(2026, 9, 7), "calls", "1", "100"),  # Monday again
        line(date(2026, 9, 12), "work", "3", "300"),  # Saturday
    ]
    (week,) = weekly_breakdown(lines)
    assert week.days == (Decimal("2"), Decimal("9"), 0, 0, 0, 0, Decimal("3"))
    assert week.hours == sum(week.days)
