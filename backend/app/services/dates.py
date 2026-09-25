"""Resolve the timing in a follow-up ("next week", "by Friday") to a date.

Deterministic on purpose: small language models are unreliable at calendar
arithmetic, and a wrong date is worse than no date. Unknown phrasing
returns None and the user can set a date by hand.
"""

import re
from datetime import date, timedelta

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
NUMBER_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "a couple of": 2, "a few": 3}


def _next_weekday(today: date, weekday: int, skip_this_week: bool = False) -> date:
    """The next given weekday after today (never today itself)."""
    days = (weekday - today.weekday()) % 7 or 7
    if skip_this_week:
        # "next friday" said on a Monday means the Friday of next week.
        start_of_next_week = today + timedelta(days=7 - today.weekday())
        return start_of_next_week + timedelta(days=weekday)
    return today + timedelta(days=days)


def resolve_due_date(text: str | None, today: date) -> date | None:
    if not text:
        return None
    t = " ".join(text.lower().split())

    if re.search(r"\b(today|tonight|this evening)\b", t):
        return today
    if re.search(r"\b(tomorrow|tmrw|tmr)\b", t):
        return today + timedelta(days=1)

    count = r"(\d+|a couple of|a few|an|a|one|two|three|four|five|six)"
    if m := re.search(rf"\bin {count} (day|week|month)s?\b", t):
        n = int(m.group(1)) if m.group(1).isdigit() else NUMBER_WORDS[m.group(1)]
        unit = {"day": 1, "week": 7, "month": 30}[m.group(2)]
        return today + timedelta(days=n * unit)

    for index, name in enumerate(WEEKDAYS):
        if m := re.search(rf"\b(next |this |on |by )?{name}\b", t):
            return _next_weekday(today, index, skip_this_week=m.group(1) == "next ")

    if re.search(r"\b(this|the) weekend\b", t):
        return _next_weekday(today, 5) if today.weekday() < 5 else today
    if re.search(r"\bnext weekend\b", t):
        return _next_weekday(today, 5, skip_this_week=True)
    if re.search(r"\b(this week|end of (the )?week)\b", t):
        friday = today + timedelta(days=4 - today.weekday())
        return friday if friday >= today else today
    if re.search(r"\bnext week\b", t):
        return _next_weekday(today, 0)  # Monday of next week
    if re.search(r"\b(end of (the )?month|this month)\b", t):
        first_of_next = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
        return first_of_next - timedelta(days=1)
    if re.search(r"\bnext month\b", t):
        return (today.replace(day=28) + timedelta(days=4)).replace(day=1)
    return None
