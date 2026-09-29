"""Try search-by-meaning against the real model with a few made-up people.

Usage (from backend/, venv active, LLM settings in backend/.env):

    python -m scripts.eval_search                      # built-in questions
    python -m scripts.eval_search "who is a bad guy?"  # your own question
    python -m scripts.eval_search --raw "bad guy"      # also print the model's raw replies

Prints who the model picks and why. Nothing touches the database.
"""

import sys
from datetime import date
from pathlib import Path

# Allow `python scripts/x.py` as well as `python -m scripts.x`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.llm import get_llm_client  # noqa: E402
from app.services.search import expand_query, search_by_meaning  # noqa: E402


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
    person(6, "Sam Ortiz", notes=["Building two startups"], said="sam is building startups in ai", event="Hackathon"),
]

QUESTIONS = [
    ("bad guy", "Marcus Lee"),
    ("who was nice to me?", "Hana Sato"),
    ("who should I build a startup with for chemistry?", "Diego Alvarez"),
    ("who could fund my robotics company?", "Tom Reed"),
    ("who might help me get a job?", "Priya Shah"),
    ("who can help me build a company", "Sam Ortiz"),
]


def main() -> None:
    llm = get_llm_client()
    args = sys.argv[1:]
    if "--raw" in args:
        args.remove("--raw")
        real = llm.chat_json

        def show(system, user, schema):
            reply = real(system, user, schema)
            print(f"     raw reply: {reply[:400]}")
            return reply

        llm.chat_json = show  # type: ignore[method-assign]
    questions = [(q, None) for q in args] or QUESTIONS
    passed = 0
    for question, expected in questions:
        chosen = search_by_meaning(PEOPLE, question, llm, date.today())
        if chosen is None:
            print(f"✗ {question!r}: the model didn't answer (check LLM settings / rate limits)")
            continue
        names = [p["name"] for p, _ in chosen]
        if expected is None:
            print(f"• {question!r} → {names or 'nobody'}")
            print(f"     phrases searched: {expand_query(question, llm)}")
        else:
            ok = expected in names[:3]
            passed += ok
            print(f"{'✓' if ok else '✗'} {question!r} → {names or 'nobody'} (expected {expected})")
        for p, why in chosen:
            print(f"     {p['name']}: {why}")
    if questions is QUESTIONS:
        print(f"\n{passed}/{len(QUESTIONS)} found the expected person in the top 3")


if __name__ == "__main__":
    main()
