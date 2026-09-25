"""Is this the same person as someone already saved?

Deliberately simple and explainable: normalized name comparison plus
company/school as supporting evidence. It only *suggests* matches; the
user always decides. Nothing is merged automatically.
"""

import re
import unicodedata
from typing import Any

MAX_CANDIDATES = 3


def normalize(text: str | None) -> str:
    """'  José  O'Neil ' -> 'jose oneil'"""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = re.sub(r"[^a-z0-9\s]", "", ascii_only.lower())
    return " ".join(cleaned.split())


def _same(a: str | None, b: str | None) -> bool:
    return bool(normalize(a)) and normalize(a) == normalize(b)


def score_candidate(query: dict[str, Any], contact: dict[str, Any]) -> tuple[str, str] | None:
    """Returns (strength, reason) if `contact` might be the queried person."""
    q_tokens = normalize(query.get("name")).split()
    c_tokens = normalize(contact.get("name")).split()
    if not q_tokens or not c_tokens:
        return None

    evidence = []
    if _same(query.get("company"), contact.get("company")):
        evidence.append(f"also at {contact['company']}")
    if _same(query.get("school"), contact.get("school")):
        evidence.append(f"also at {contact['school']}")
    suffix = f" · {', '.join(evidence)}" if evidence else ""

    if q_tokens == c_tokens:
        return "strong", "Same name" + suffix

    if q_tokens[0] != c_tokens[0]:
        return None

    # Same first name. "Jason" vs "Jason Chen", or "Jason C" vs "Jason Chen".
    one_is_first_name_only = len(q_tokens) == 1 or len(c_tokens) == 1
    same_last_initial = (
        len(q_tokens) > 1 and len(c_tokens) > 1 and q_tokens[-1][0] == c_tokens[-1][0]
        and (len(q_tokens[-1]) == 1 or len(c_tokens[-1]) == 1)
    )
    if one_is_first_name_only or same_last_initial:
        strength = "strong" if evidence else "possible"
        return strength, "Same first name" + suffix
    return None


def find_candidates(query: dict[str, Any], contacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    matches = []
    for contact in contacts:
        scored = score_candidate(query, contact)
        if scored:
            strength, reason = scored
            matches.append({**contact, "contact_id": contact["id"], "strength": strength, "reason": reason})
    matches.sort(
        key=lambda m: (
            m["strength"] != "strong",
            -(m["last_interaction_at"].timestamp() if m.get("last_interaction_at") else 0),
        )
    )
    return matches[:MAX_CANDIDATES]
