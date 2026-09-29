"""Try search-by-meaning against the real model with a few made-up people.

Usage (from backend/, venv active, LLM settings in backend/.env):

    python -m scripts.eval_search                      # built-in questions
    python -m scripts.eval_search "who is a bad guy?"  # your own question

Prints who the model picks and why. Nothing touches the database.
"""

import sys
from datetime import date
from pathlib import Path

# Allow `python scripts/x.py` as well as `python -m scripts.x`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.llm import get_llm_client  # noqa: E402
from app.services.search import rank_profiles  # noqa: E402


def person(pid, name, role=None, company=None, school=None, notes=(), projects=(), interests=(), said=None, event=None):
    return {
        "id": pid, "name": name, "role": role, "company": company, "school": school, "major": None,
        "location": None, "summary": None, "open_follow_ups": [],
        "moments": [{"event": event, "date": "2026-09-20", "projects": list(projects), "needs": [], "topics": [],
                     "interests": list(interests), "notes": list(notes), "said": said}],
    }


PEOPLE = [
    person(1, "Marcus Lee", "Sales lead", "Acme", notes=["Not a good guy", "Talked over everyone"], event="Mixer"),
    person(2, "Priya Shah", "Software engineer", "Figma", notes=["Offered to refer me"], event="Career fair"),
    person(3, "Diego Alvarez", "Chemical engineering PhD", school="Stanford", projects=["battery materials"],
           notes=["Wants a cofounder"], event="Founders mixer"),
    person(4, "Hana Sato", said="met hana in office hours she's super kind and helped me debug my project", event="Office hours"),
    person(5, "Tom Reed", "Investor", "Northwind Ventures", interests=["climate", "robotics"], event="Demo day"),
]

QUESTIONS = [
    ("bad guy", "Marcus Lee"),
    ("who was nice to me?", "Hana Sato"),
    ("who should I build a startup with for chemistry?", "Diego Alvarez"),
    ("who could fund my robotics company?", "Tom Reed"),
    ("who might help me get a job?", "Priya Shah"),
]


def main() -> None:
    llm = get_llm_client()
    questions = [(q, None) for q in sys.argv[1:]] or QUESTIONS
    passed = 0
    for question, expected in questions:
        chosen = rank_profiles(PEOPLE, question, llm, date.today())
        if chosen is None:
            print(f"✗ {question!r}: the model didn't answer (check LLM settings / rate limits)")
            continue
        names = [p["name"] for p, _ in chosen]
        ok = expected is None or (names and names[0] == expected)
        passed += ok
        print(f"{'✓' if ok else '✗'} {question!r} → {names or 'nobody'}")
        for p, why in chosen:
            print(f"     {p['name']}: {why}")
    if questions is QUESTIONS:
        print(f"\n{passed}/{len(QUESTIONS)} picked the expected person first")


if __name__ == "__main__":
    main()
