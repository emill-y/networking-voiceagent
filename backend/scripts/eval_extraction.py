"""Score the live extraction model against tests/extraction_cases.json.

Usage (from backend/, with Ollama running and the venv active):

    python -m scripts.eval_extraction            # all cases
    python -m scripts.eval_extraction slang      # cases whose id contains "slang"

This calls the real model, so it is slow and not part of `pytest`.
Use it when changing the prompt, schema, or model (e.g. qwen3:8b).
"""

import json
import sys
import time
from pathlib import Path


# Allow `python scripts/x.py` as well as `python -m scripts.x`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.services.extraction import extract_people
from app.services.llm import get_llm_client

CASES_PATH = Path(__file__).resolve().parents[2] / "tests" / "extraction_cases.json"


def _contains(haystack, needle: str) -> bool:
    return haystack is not None and needle.lower() in str(haystack).lower()


def _match_person(people: list[dict], expected_name: str | None) -> dict | None:
    if expected_name is None:
        return people[0] if len(people) == 1 else None
    return next((p for p in people if _contains(p.get("name"), expected_name)), None)


def check_case(case: dict, people: list[dict]) -> list[str]:
    expect = case["expect"]
    failures = []
    if len(people) != expect["peopleCount"]:
        failures.append(f"expected {expect['peopleCount']} people, got {len(people)}")
    for exp in expect.get("people", []):
        person = _match_person(people, exp.get("name"))
        label = exp.get("name") or "unnamed person"
        if person is None:
            failures.append(f"missing {label}")
            continue
        for field, needle in exp.get("fields", {}).items():
            if not _contains(person.get(field), needle):
                failures.append(f"{label}.{field}: wanted '{needle}', got {person.get(field)!r}")
        for field in exp.get("absent", []):
            if person.get(field) is not None:
                failures.append(f"{label}.{field}: should be null, got {person.get(field)!r}")
        for field in exp.get("nonNull", []):
            if person.get(field) is None:
                failures.append(f"{label}.{field}: should be set")
        for field, needles in exp.get("listsContain", {}).items():
            for needle in needles:
                if not any(_contains(item, needle) for item in person.get(field, [])):
                    failures.append(f"{label}.{field}: no item containing '{needle}'")
        for needle in exp.get("notesContain", []):
            if not any(_contains(note, needle) for note in person.get("notes", [])):
                failures.append(f"{label}.notes: no note containing '{needle}'")
    return failures


def main() -> int:
    selector = sys.argv[1] if len(sys.argv) > 1 else ""
    cases = [c for c in json.loads(CASES_PATH.read_text())["cases"] if selector in c["id"]]
    llm = get_llm_client()
    settings = get_settings()
    model = settings.llm_model if settings.llm_provider == "openai_compatible" else settings.ollama_model
    print(f"Model: {settings.llm_provider}/{model} · {len(cases)} cases\n")

    passed = 0
    for case in cases:
        started = time.perf_counter()
        try:
            result = extract_people(case["transcript"], llm)
            people = result.model_dump(by_alias=True)["people"]
            failures = check_case(case, people)
        except Exception as exc:  # Report and keep going.
            failures = [f"error: {exc}"]
        seconds = time.perf_counter() - started
        status = "PASS" if not failures else "FAIL"
        passed += not failures
        print(f"{status}  {case['id']:<18} {seconds:5.1f}s")
        for failure in failures:
            print(f"      - {failure}")

    print(f"\n{passed}/{len(cases)} passed")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
