from datetime import date

import pytest

from app.services.dates import resolve_due_date

THURSDAY = date(2026, 9, 24)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Reach out next week", date(2026, 9, 28)),
        ("Send her my deck by Friday", date(2026, 9, 25)),
        ("Call him on Monday", date(2026, 9, 28)),
        ("Coffee next Friday", date(2026, 10, 2)),
        ("Text him Thursday", date(2026, 10, 1)),  # the next one, not today
        ("Email tomorrow", date(2026, 9, 25)),
        ("Follow up tonight", THURSDAY),
        ("Ping in 3 days", date(2026, 9, 27)),
        ("Check in in two weeks", date(2026, 10, 8)),
        ("Circle back in a couple of weeks", date(2026, 10, 8)),
        ("Intro this week", date(2026, 9, 25)),
        ("Grab lunch this weekend", date(2026, 9, 26)),
        ("Send the recap by end of month", date(2026, 9, 30)),
        ("Reconnect next month", date(2026, 10, 1)),
        ("Hit him up tmrw fr", date(2026, 9, 25)),
        ("Reach out soon", None),
        ("", None),
        (None, None),
    ],
)
def test_resolve_due_date(text, expected):
    assert resolve_due_date(text, THURSDAY) == expected


def test_end_of_month_in_december():
    assert resolve_due_date("by end of month", date(2026, 12, 3)) == date(2026, 12, 31)
    assert resolve_due_date("next month", date(2026, 12, 3)) == date(2027, 1, 1)
