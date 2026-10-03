"""Contacts as a spreadsheet: one row per person, one column per stored field."""

import csv
import io
from datetime import datetime

COLUMNS: list[tuple[str, str]] = [
    ("Name", "name"),
    ("Email", "email"),
    ("Phone", "phone"),
    ("Company", "company"),
    ("Role", "role"),
    ("School", "school"),
    ("Major", "major"),
    ("Location", "location"),
    ("Interests", "interests"),
    ("Working on", "projects"),
    ("Looking for", "needs"),
    ("Talked about", "topics"),
    ("Where you met", "events"),
    ("Notes", "notes"),
    ("Summary", "summary"),
    ("Open follow-ups", "open_follow_ups"),
    ("Times met", "moments"),
    ("First met", "first_met_at"),
    ("Last interaction", "last_interaction_at"),
    ("LinkedIn", "linkedin_url"),
    ("Website", "website_url"),
]


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, (list, tuple)):
        return "; ".join(str(v) for v in value if v)
    text = str(value)
    # Spreadsheet apps run cells starting with these as formulas.
    return f"'{text}" if text[:1] in ("=", "+", "-", "@") else text


def to_table(rows: list[dict], delimiter: str = ",") -> str:
    out = io.StringIO()
    writer = csv.writer(out, delimiter=delimiter, lineterminator="\n")
    writer.writerow([label for label, _ in COLUMNS])
    for row in rows:
        writer.writerow([_cell(row.get(key)) for _, key in COLUMNS])
    return out.getvalue()
