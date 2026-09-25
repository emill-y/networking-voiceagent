import json
from datetime import date

from app.main import app
from app.schemas.search import SearchFilters
from app.services.llm import LLMUnavailable, get_llm_client
from app.services.search import interpret, keyword_filters
from tests.conftest import OTHER_USER_ID
from tests.test_contacts import capture


class FakeLLM:
    def __init__(self, filters: dict | None = None, error: Exception | None = None):
        self.filters = filters or {}
        self.error = error
        self.calls = []

    def chat_json(self, system, user, schema):
        self.calls.append({"system": system, "user": user})
        if self.error:
            raise self.error
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
    assert "Today is" in fake.calls[0]["system"]


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
