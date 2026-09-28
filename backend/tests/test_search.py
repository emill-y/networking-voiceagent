import json
from datetime import date

from app.main import app
from app.schemas.search import SearchFilters
from app.services.llm import LLMUnavailable, get_llm_client
from app.services.search import RANK_JSON_SCHEMA, interpret, keyword_filters
from tests.conftest import OTHER_USER_ID
from tests.test_contacts import capture


class FakeLLM:
    """Answers filter questions with `filters`; ranking questions with `ranking`
    (None = a junk answer, so search falls back to filters)."""

    def __init__(self, filters: dict | None = None, error: Exception | None = None, ranking=None):
        self.filters = filters or {}
        self.error = error
        self.ranking = ranking
        self.calls = []

    def chat_json(self, system, user, schema):
        self.calls.append({"system": system, "user": user})
        if self.error:
            raise self.error
        if schema is RANK_JSON_SCHEMA:
            return json.dumps(self.ranking if self.ranking is not None else {"oops": True})
        return json.dumps(self.filters)


def use(fake):
    app.dependency_overrides[get_llm_client] = lambda: fake
    return fake


def seed(client):
    capture(client, {
        "contact": {"name": "Jason Chen", "role": "Founder", "school": "UC Berkeley"},
        "interaction": {"event": "Cal Hacks", "projects": ["robotics startup"], "needs": ["designers"],
                        "interactionDate": "2026-09-20T18:00:00Z"},
        "followUp": {"action": "Send Jason the intro"},
    })
    capture(client, {
        "contact": {"name": "Emma Park", "company": "Google", "role": "Product Manager"},
        "interaction": {"event": "Coffee", "topicsDiscussed": ["search quality"],
                        "interactionDate": "2026-06-01T18:00:00Z"},
    })


def names(response):
    assert response.status_code == 200, response.text
    return [r["contact"]["name"] for r in response.json()["results"]]


def test_simple_queries_skip_the_llm(db_client):
    seed(db_client)
    fake = use(FakeLLM())
    assert names(db_client.post("/search", json={"query": "robotics"})) == ["Jason Chen"]
    assert names(db_client.post("/search", json={"query": "emma"})) == ["Emma Park"]
    assert fake.calls == []


def test_full_text_matches_word_forms(db_client):
    seed(db_client)
    use(FakeLLM())
    response = db_client.post("/search", json={"query": "designer"})
    assert names(response) == ["Jason Chen"]
    assert response.json()["results"][0]["reasons"] == ["Looking for designers"]


def test_question_is_interpreted_into_filters(db_client):
    seed(db_client)
    fake = use(FakeLLM({"keywords": [], "company": "Google"}))
    response = db_client.post("/search", json={"query": "Who do I know at Google?"})
    assert names(response) == ["Emma Park"]
    body = response.json()
    assert body["interpreted"] is True
    assert body["filters"]["company"] == "Google"
    assert body["results"][0]["reasons"] == ["Works at Google"]
    assert "Today is" in fake.calls[-1]["system"]


def test_event_and_date_filters(db_client):
    seed(db_client)
    use(FakeLLM({"event": "cal hacks"}))
    response = db_client.post("/search", json={"query": "Who did I meet at Cal Hacks?"})
    assert names(response) == ["Jason Chen"]
    assert response.json()["results"][0]["reasons"] == ["Met at Cal Hacks · Sep 20"]

    use(FakeLLM({"metAfter": "2026-09-01"}))
    assert names(db_client.post("/search", json={"query": "Who did I meet this month?"})) == ["Jason Chen"]

    use(FakeLLM({"metBefore": "2026-07-01"}))
    assert names(db_client.post("/search", json={"query": "Who did I meet before July?"})) == ["Emma Park"]


def test_follow_up_filter(db_client):
    seed(db_client)
    use(FakeLLM({"hasOpenFollowUp": True}))
    response = db_client.post("/search", json={"query": "Who did I promise to follow up with?"})
    assert names(response) == ["Jason Chen"]
    assert response.json()["results"][0]["reasons"] == ["You planned to: Send Jason the intro"]


def test_falls_back_to_keywords_when_llm_is_down(db_client):
    seed(db_client)
    use(FakeLLM(error=LLMUnavailable("down")))
    response = db_client.post("/search", json={"query": "who is working on robotics?"})
    assert names(response) == ["Jason Chen"]
    assert response.json()["interpreted"] is False
    assert response.json()["filters"]["keywords"] == ["robotics"]


def test_falls_back_when_llm_returns_invalid_filters(db_client):
    seed(db_client)
    use(FakeLLM({"metAfter": "last tuesday"}))
    response = db_client.post("/search", json={"query": "who works at google?"})
    assert names(response) == ["Emma Park"]
    assert response.json()["interpreted"] is False


def test_query_without_terms_returns_nothing(db_client):
    seed(db_client)
    use(FakeLLM())
    assert names(db_client.post("/search", json={"query": "%"})) == []


def test_wildcards_in_filters_are_literal(db_client):
    seed(db_client)
    for wildcard in ("%", "_"):
        use(FakeLLM({"company": wildcard, "keywords": [wildcard]}))
        assert names(db_client.post("/search", json={"query": "who works at percent?"})) == []


def test_search_is_scoped_to_the_user(db_client):
    seed(db_client)
    use(FakeLLM())
    db_client.act_as(OTHER_USER_ID)
    assert names(db_client.post("/search", json={"query": "robotics"})) == []


def test_keyword_filters_drop_filler():
    assert keyword_filters("Who is working on robotics?").keywords == ["robotics"]


def test_empty_interpretation_falls_back():
    filters, interpreted = interpret("tell me about my network please", FakeLLM({}), date(2026, 9, 25))
    assert interpreted is False
    assert filters == SearchFilters(keywords=["tell", "about", "network", "please"])


def ref_for(fake_call_user: str, name: str) -> str:
    """The p<n> label the model was shown for this person."""
    for line in fake_call_user.splitlines():
        if line.startswith("p") and f": {name}" in line:
            return line.split(":")[0]
    raise AssertionError(f"{name} not shown to the model")


class RankingLLM(FakeLLM):
    """Picks people by name, the way a real model would pick by meaning."""

    def __init__(self, picks):
        super().__init__()
        self.picks = picks

    def chat_json(self, system, user, schema):
        self.calls.append({"system": system, "user": user})
        if schema is not RANK_JSON_SCHEMA:
            return json.dumps({})
        return json.dumps({"matches": [{"person": ref_for(user, n), "why": w} for n, w in self.picks]})


def test_questions_are_answered_by_meaning(db_client):
    seed(db_client)
    fake = use(RankingLLM([("Jason Chen", "Founder building a robotics startup.")]))
    response = db_client.post(
        "/search", json={"query": "Who should I build a company with for chemistry?", "today": "2026-09-27"}
    )
    assert names(response) == ["Jason Chen"]
    body = response.json()
    assert body["interpreted"] is True
    assert body["results"][0]["reasons"] == ["Founder building a robotics startup."]
    assert body["results"][0]["contact"]["lastEvent"] == "Cal Hacks"
    # The model read both people's notes, including projects and follow-ups.
    shown = fake.calls[0]["user"]
    assert "building: robotics startup" in shown and "Emma Park" in shown
    assert "you planned: Send Jason the intro" in shown
    assert "Today is 2026-09-27" in fake.calls[0]["system"]


def test_ranking_ignores_unknown_or_repeated_people(db_client):
    seed(db_client)

    class Sloppy(FakeLLM):
        def chat_json(self, system, user, schema):
            emma = ref_for(user, "Emma Park")
            return json.dumps({"matches": [
                {"person": "p99", "why": "made up"},
                {"person": emma, "why": "Product manager at Google."},
                {"person": emma, "why": "again"},
            ]})

    use(Sloppy())
    assert names(db_client.post("/search", json={"query": "who knows about search products?"})) == ["Emma Park"]


def test_ranking_never_shows_other_users_people(db_client):
    seed(db_client)
    db_client.act_as(OTHER_USER_ID)
    fake = use(RankingLLM([]))
    assert names(db_client.post("/search", json={"query": "who should I build a startup with?"})) == []
    assert fake.calls == []  # nobody to rank, so no model call


def test_empty_ranking_means_nobody_fits(db_client):
    seed(db_client)
    use(FakeLLM(ranking={"matches": []}))
    response = db_client.post("/search", json={"query": "who plays professional hockey?"})
    assert names(response) == []
    assert response.json()["interpreted"] is True
