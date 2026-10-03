import json
from datetime import date, datetime, timezone

import httpx
import pytest

from app.main import app
from app.routes import plans as plans_route
from app.services import calendar_sync
from app.services import plans as planner
from app.services.llm import LLMUnavailable, get_llm_client
from app.services.real_events import (
    FeedError,
    conferences_from_json,
    fetch_feed_text,
    get_event_sources,
    in_window,
    normalize_feed_url,
    parse_ics,
)
from tests.test_contacts import capture

TODAY = datetime.now(timezone.utc).date()


def ics_day(days: int) -> str:
    return date.fromordinal(TODAY.toordinal() + days).strftime("%Y%m%d")


def mixer_ics() -> str:
    return "\r\n".join([
        "BEGIN:VCALENDAR",
        "X-WR-CALNAME:Cal Chem Club",
        "BEGIN:VEVENT",
        "UID:mixer-1",
        "SUMMARY:Chemistry mixer",
        f"DTSTART;TZID=America/Los_Angeles:{ics_day(3)}T180000",
        f"DTEND;TZID=America/Los_Angeles:{ics_day(3)}T200000",
        "LOCATION:Latimer Hall\\, Berkeley",
        "DESCRIPTION:Meet chem majors\\, grad students and pizza. RSVP https://lu.ma/chem",
        " -mixer",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:old",
        "SUMMARY:Last year's mixer",
        "DTSTART;VALUE=DATE:20200101",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:gone",
        "SUMMARY:Cancelled thing",
        f"DTSTART:{ics_day(2)}T170000Z",
        "STATUS:CANCELLED",
        "END:VEVENT",
        "END:VCALENDAR",
    ])


def test_ics_feeds_are_read():
    name, events = parse_ics(mixer_ics(), "lu.ma", "feed-1")
    assert name == "Cal Chem Club"
    assert [e["title"] for e in events] == ["Chemistry mixer", "Last year's mixer"]  # cancelled dropped
    mixer = events[0]
    assert mixer["start"].endswith("T18:00:00-07:00") or mixer["start"].endswith("T18:00:00-08:00")
    assert mixer["city"] == "Latimer Hall, Berkeley"
    assert mixer["url"] == "https://lu.ma/chem-mixer"  # folded line joined
    assert mixer["source"] == "feed" and mixer["all_day"] is False
    assert [e["title"] for e in in_window(events, TODAY, 30)] == ["Chemistry mixer"]


def test_feed_links_must_be_public_https():
    assert normalize_feed_url(" webcal://lu.ma/ics/cal-1 ") == "https://lu.ma/ics/cal-1"
    for bad in ["http://example.com/cal.ics", "file:///etc/passwd", "javascript:alert(1)"]:
        with pytest.raises(FeedError):
            normalize_feed_url(bad)
    with pytest.raises(FeedError, match="private"):
        fetch_feed_text(httpx.Client(), "https://127.0.0.1/cal.ics")


def test_feed_redirects_are_checked_again():
    seen = []

    def check(host):
        seen.append(host)
        if host == "169.254.169.254":
            raise FeedError("That link points somewhere private.")

    def handler(request):
        if request.url.host == "calendar.test":
            return httpx.Response(302, headers={"location": "https://169.254.169.254/latest"})
        return httpx.Response(200, text="BEGIN:VCALENDAR")

    with pytest.raises(FeedError, match="private"):
        fetch_feed_text(httpx.Client(transport=httpx.MockTransport(handler)), "https://calendar.test/c.ics", check)
    assert seen == ["calendar.test", "169.254.169.254"]

    ok = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text="<html>nope</html>")))
    with pytest.raises(FeedError, match="isn’t a calendar"):
        fetch_feed_text(ok, "https://calendar.test/c.ics", lambda host: None)


def conference(name, days, city, topic, online=False):
    start = date.fromordinal(TODAY.toordinal() + days).isoformat()
    event = conferences_from_json([{"name": name, "url": f"https://{name.lower().replace(' ', '')}.test",
                                    "startDate": start, "endDate": start, "city": city,
                                    "country": "U.S.A.", "online": online}], topic)[0]
    return {**event, "category": "networking" if topic == "leadership" else "tech",
            "venue": None, "lat": None, "lon": None, "image_url": None}


def test_where_events_are():
    sf = conference("Founders Summit", 5, "San Francisco, CA", "leadership")
    assert planner.where(sf, "San Francisco") == "local"
    assert planner.where(sf, "Berkeley, CA") == "nearby"
    assert planner.where(sf, "London") == "travel"
    assert planner.where(sf, "") == "anywhere"
    assert planner.where({**sf, "online": True}, "London") == "online"


class FakeSources:
    def __init__(self):
        self.conference_list = [
            conference("Founders Summit", 5, "San Francisco, CA", "leadership"),
            conference("JSConf Far Away", 9, "Lisbon", "javascript"),
            conference("Rust Days", 12, "San Francisco, CA", "rust"),
        ]
        self.feeds = {"https://lu.ma/ics/chem": mixer_ics()}
        self.queries = []

    def discover(self, query):
        self.queries.append(query)
        return self.conference_list, []

    def feed(self, url, label, feed_id):
        if url not in self.feeds:
            raise FeedError("Couldn’t reach that calendar.")
        return parse_ics(self.feeds[url], label, feed_id)


class PlanningLLM:
    """Stands in for the model: plans the mixer with whoever is into chemistry."""

    def __init__(self):
        self.prompts = []

    def chat_json(self, system, user, schema):
        self.prompts.append(user)
        events = dict(line.split(": ", 1) for line in user.split("\n\nPEOPLE:\n")[0].splitlines()[1:])
        people = dict(line.split(": ", 1) for line in user.split("\n\nPEOPLE:\n")[1].splitlines())
        plans = []
        for eid, text in events.items():
            for pid, person in people.items():
                if "Chemistry" in text and "chem" in person.lower():
                    plans.append({"event": eid, "people": [pid], "shared": "Chemistry",
                                  "why": "You’re both into chemistry."})
                if "Founders" in text and "startup" in person.lower():
                    plans.append({"event": eid, "people": [pid, "p99"], "shared": "startups",
                                  "why": "You’re both into startups, and Eisha is raising."})
        plans.append({"event": "e42", "people": ["p1"], "shared": "x", "why": "made up"})
        return json.dumps({"plans": plans})


class DownLLM:
    def chat_json(self, system, user, schema):
        raise LLMUnavailable("down")


@pytest.fixture
def sources():
    fake = FakeSources()
    plans_route._cache.clear()
    app.dependency_overrides[get_event_sources] = lambda: fake
    app.dependency_overrides[calendar_sync.get_calendar_client] = lambda: None
    return fake


def people(client):
    capture(client, {"contact": {"name": "Eisha Yadav", "role": "Founder"},
                     "interaction": {"projects": ["a startup for students"], "interests": ["startups"]}})
    capture(client, {"contact": {"name": "Annie Park", "major": "Chemistry"},
                     "interaction": {"interests": ["chemistry", "running"]}})


def test_plans_pair_real_events_with_your_people(db_client, sources):
    llm = PlanningLLM()
    app.dependency_overrides[get_llm_client] = lambda: llm
    people(db_client)
    added = db_client.post("/event-feeds", json={"url": "webcal://lu.ma/ics/chem"})
    assert added.status_code == 201, added.text
    assert added.json()["feed"]["label"] == "Cal Chem Club" and added.json()["upcoming"] == 1
    assert db_client.post("/event-feeds", json={"url": "https://lu.ma/ics/chem"}).status_code == 409

    body = db_client.get("/plans", params={"city": "San Francisco, CA", "interests": "startups, chemistry"}).json()
    got = [(p["event"]["title"], [x["name"] for x in p["people"]], p["shared"]) for p in body["plans"]]
    assert ("Chemistry mixer", ["Annie Park"], "chemistry") in got
    assert ("Founders Summit", ["Eisha Yadav"], "startups") in got  # the made-up p99 and e42 dropped
    assert len(got) == 2
    titles = [e["title"] for e in body["events"]]
    assert "JSConf Far Away" not in titles  # far away and not about you
    assert {"Founders Summit", "Chemistry mixer", "Rust Days"} <= set(titles)
    mixer = next(e for e in body["events"] if e["title"] == "Chemistry mixer")
    assert mixer["where"] == "local" and mixer["sourceLabel"] == "Cal Chem Club"
    assert [s["kind"] for s in body["sources"]] == ["feed"]  # the calendars you follow
    assert {c["key"] for c in body["categories"]} >= {"networking", "tech"}


def test_plans_fall_back_to_keywords(db_client, sources):
    app.dependency_overrides[get_llm_client] = lambda: DownLLM()
    people(db_client)
    db_client.post("/event-feeds", json={"url": "https://lu.ma/ics/chem"})
    body = db_client.get("/plans", params={"city": "San Francisco", "interests": "chemistry"}).json()
    got = {p["event"]["title"]: (p["people"][0]["name"], p["why"]) for p in body["plans"]}
    assert got["Chemistry mixer"] == ("Annie Park", "You’re both into chemistry.")
    assert got["Founders Summit"][0] == "Eisha Yadav"


def test_a_broken_source_doesnt_break_the_page(db_client, sources):
    app.dependency_overrides[get_llm_client] = lambda: DownLLM()

    def down(query):
        raise httpx.ConnectError("providers down")

    sources.discover = down
    body = db_client.get("/plans").json()
    assert body["plans"] == [] and body["events"] == [] and body["categories"] == []


def test_feeds_are_yours_and_can_be_removed(db_client, sources):
    bad = db_client.post("/event-feeds", json={"url": "https://nowhere.test/cal.ics"})
    assert bad.status_code == 400 and "reach" in bad.json()["detail"]
    assert db_client.post("/event-feeds", json={"url": "http://lu.ma/ics/chem"}).status_code == 400
    feed = db_client.post("/event-feeds", json={"url": "https://lu.ma/ics/chem"}).json()["feed"]
    assert [f["id"] for f in db_client.get("/event-feeds").json()] == [feed["id"]]

    import uuid
    db_client.act_as(uuid.uuid4())
    assert db_client.get("/event-feeds").json() == []
    assert db_client.delete(f"/event-feeds/{feed['id']}").status_code == 404


def test_deleting_your_data_removes_feeds(db_client, sources):
    db_client.post("/event-feeds", json={"url": "https://lu.ma/ics/chem"})
    assert db_client.delete("/me/data").status_code == 204
    assert db_client.get("/event-feeds").json() == []
