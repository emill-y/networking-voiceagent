"""Phrasing stored memory as short sentences (mirrors mobile/lib/memory.ts)."""

PREFIXES = {
    "projects": "Working on",
    "needs": "Looking for",
    "topics_discussed": "You talked about",
    "interests": "Into",
}


def join_list(items: list[str]) -> str:
    if len(items) <= 1:
        return items[0] if items else ""
    return f"{', '.join(items[:-1])} and {items[-1]}"


def sentence_for_list(field: str, items: list[str]) -> str:
    if field == "notes":
        return items[0]
    return f"{PREFIXES[field]} {join_list(items)}"
