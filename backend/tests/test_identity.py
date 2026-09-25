from app.services.identity import normalize, score_candidate


def test_normalize():
    assert normalize("  José  O'Neil ") == "jose oneil"
    assert normalize(None) == ""


def test_different_last_names_do_not_match():
    assert score_candidate({"name": "Jason Chen"}, {"name": "Jason Park"}) is None


def test_different_first_names_do_not_match():
    assert score_candidate({"name": "Emma Chen"}, {"name": "Jason Chen"}) is None


def test_school_makes_first_name_match_strong():
    strength, reason = score_candidate(
        {"name": "Jason", "school": "uc berkeley"}, {"name": "Jason Chen", "school": "UC Berkeley"}
    )
    assert strength == "strong"
    assert "UC Berkeley" in reason
