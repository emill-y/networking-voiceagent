import json


from app.main import app
from app.services.llm import LLMUnavailable, get_llm_client

PERSON = {
    "name": "Priya Shah", "company": "Stripe", "role": "Engineer", "school": None, "major": None,
    "metAt": "Career fair", "location": None, "interests": [], "projects": [], "needs": [],
    "topicsDiscussed": ["payments"], "notes": [], "followUp": "Send my resume", "followUpDue": None,
}


class FakeLLM:
    def __init__(self, error=None):
        self.error = error

    def chat_json(self, system, user, schema):
        if self.error:
            raise self.error
        return json.dumps({"people": [PERSON]})


def post(client, text, **headers):
    return client.post("/demo/extract", json={"text": text}, headers=headers)


def test_demo_needs_no_account_and_saves_nothing(client):
    app.dependency_overrides[get_llm_client] = lambda: FakeLLM()
    response = post(client, "I met Priya Shah from Stripe at the career fair.")
    assert response.status_code == 200, response.text
    assert response.json()["people"][0]["name"] == "Priya Shah"
    app.dependency_overrides.clear()


def test_demo_is_rate_limited_per_visitor(client):
    app.dependency_overrides[get_llm_client] = lambda: FakeLLM()
    codes = [post(client, "Met Priya at the fair", **{"X-Forwarded-For": "1.2.3.4"}).status_code for _ in range(7)]
    assert codes[:6] == [200] * 6 and codes[6] == 429
    # Someone else isn't affected.
    assert post(client, "Met Priya at the fair", **{"X-Forwarded-For": "5.6.7.8"}).status_code == 200
    app.dependency_overrides.clear()


def test_demo_rejects_long_text_and_reports_busy_model(client):
    app.dependency_overrides[get_llm_client] = lambda: FakeLLM()
    assert post(client, "x" * 801).status_code == 422
    app.dependency_overrides[get_llm_client] = lambda: FakeLLM(error=LLMUnavailable("down"))
    assert post(client, "Met Priya at the fair").status_code == 503
    app.dependency_overrides.clear()
