import json

import httpx
import pytest

from app.main import app
from app.schemas.extraction import EXTRACTION_JSON_SCHEMA
from app.services import llm as llm_module
from app.services.llm import LLMUnavailable, OllamaClient, get_llm_client

JASON = {
    "name": "  Jason   Chen ",
    "company": None,
    "role": "Founder",
    "school": "UC Berkeley",
    "major": "EECS",
    "metAt": "Berkeley founders mixer",
    "location": None,
    "interests": [],
    "projects": ["robotics startup", "Robotics startup"],
    "needs": ["designers"],
    "topicsDiscussed": ["Magic Hour"],
    "notes": ["", "sophomore"],
    "followUp": "Reach out next week",
}


class FakeLLM:
    def __init__(self, *responses: str):
        self.responses = list(responses)
        self.calls: list[dict] = []

    def chat_json(self, system: str, user: str, schema: dict) -> str:
        self.calls.append({"system": system, "user": user, "schema": schema})
        return self.responses.pop(0)


def use(fake):
    app.dependency_overrides[get_llm_client] = lambda: fake


def test_extracts_and_cleans_people(client):
    fake = FakeLLM(json.dumps({"people": [JASON]}))
    use(fake)
    response = client.post("/extract", json={"transcript": "Today I met Jason Chen..."})
    assert response.status_code == 200
    person = response.json()["people"][0]
    assert person["name"] == "Jason Chen"
    assert person["projects"] == ["robotics startup"]  # case-insensitive dedupe
    assert person["notes"] == ["sophomore"]  # blanks dropped
    assert person["topicsDiscussed"] == ["Magic Hour"]
    assert person["followUp"] == "Reach out next week"
    assert fake.calls[0]["schema"] is EXTRACTION_JSON_SCHEMA
    assert "Jason Chen" in fake.calls[0]["user"]


def test_multiple_people_are_kept_separate(client):
    emma = {**JASON, "name": "Emma", "role": "Designer", "company": "Figma", "school": None}
    use(FakeLLM(json.dumps({"people": [JASON, emma]})))
    response = client.post("/extract", json={"transcript": "I met Jason and Emma."})
    names = [p["name"] for p in response.json()["people"]]
    assert names == ["Jason Chen", "Emma"]


def test_empty_people_are_dropped(client):
    empty = {key: ([] if isinstance(value, list) else None) for key, value in JASON.items()}
    empty["company"] = "unknown"
    use(FakeLLM(json.dumps({"people": [empty]})))
    response = client.post("/extract", json={"transcript": "Nothing much happened."})
    assert response.json() == {"people": []}


def test_retries_once_on_invalid_output(client):
    fake = FakeLLM("not json", json.dumps({"people": [JASON]}))
    use(fake)
    response = client.post("/extract", json={"transcript": "I met Jason Chen."})
    assert response.status_code == 200
    assert len(fake.calls) == 2


def test_gives_up_after_repeated_invalid_output(client):
    use(FakeLLM('{"people": "nope"}', '{"people": [{"name": 5}]}'))
    response = client.post("/extract", json={"transcript": "I met Jason Chen."})
    assert response.status_code == 502


def test_llm_unavailable_is_503(client):
    class Down:
        def chat_json(self, system, user, schema):
            raise LLMUnavailable("The language model (qwen3:4b) is unavailable.")

    use(Down())
    response = client.post("/extract", json={"transcript": "I met Jason Chen."})
    assert response.status_code == 503


@pytest.mark.parametrize("body", [{}, {"transcript": ""}, {"transcript": "x" * 20_001}])
def test_rejects_bad_requests(client, body):
    use(FakeLLM())
    assert client.post("/extract", json=body).status_code == 422


def test_ollama_client_sends_structured_request(monkeypatch):
    seen = {}

    def fake_post(url, json, timeout):
        seen.update(url=url, payload=json)
        return httpx.Response(
            200,
            json={"message": {"content": '{"people": []}'}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(llm_module.httpx, "post", fake_post)
    client = OllamaClient("http://ollama:11434", "qwen3:4b", 5)
    assert client.chat_json("sys", "user", {"type": "object"}) == '{"people": []}'
    assert seen["url"] == "http://ollama:11434/api/chat"
    assert seen["payload"]["think"] is False
    assert seen["payload"]["format"] == {"type": "object"}
    assert seen["payload"]["options"]["temperature"] == 0


def test_ollama_client_connection_error(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(llm_module.httpx, "post", fake_post)
    with pytest.raises(LLMUnavailable):
        OllamaClient("http://ollama:11434", "qwen3:4b", 5).chat_json("s", "u", {})
