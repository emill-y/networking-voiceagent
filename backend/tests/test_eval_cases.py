"""Keeps the evaluation dataset well-formed and the scorer honest."""

import json

from scripts.eval_extraction import CASES_PATH, check_case

REQUIRED_CATEGORIES = {
    "single person", "multiple people", "uncertain facts", "corrections", "slang",
    "long rambling speech", "missing name/company", "follow-up request",
    "event/location", "repeated contact", "noisy transcript",
}


def test_dataset_covers_required_categories():
    cases = json.loads(CASES_PATH.read_text())["cases"]
    assert REQUIRED_CATEGORIES <= {case["category"] for case in cases}
    assert len({case["id"] for case in cases}) == len(cases)


def test_scorer_flags_hedged_fact_stored_as_certain():
    case = next(c for c in json.loads(CASES_PATH.read_text())["cases"] if c["id"] == "uncertain-fact")
    wrong = [{"name": "Emma Park", "company": "Google", "notes": [], "interests": ["climbing"]}]
    right = [{"name": "Emma Park", "company": None, "notes": ["Unsure: may work at Google"], "interests": ["climbing"]}]
    assert check_case(case, wrong)
    assert check_case(case, right) == []
