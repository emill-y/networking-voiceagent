from datetime import date, timedelta

import httpx

from app.main import app
from app.routes import plans as plans_route
from app.services import event_providers as ep
from app.services.llm import LLMUnavailable, get_llm_client
from app.services.real_events import get_event_sources
from tests.test_contacts import capture

TODAY = date.today()
SOON = (TODAY + timedelta(days=4)).isoformat()


def ticketmaster_payload():
    return {"_embedded": {"events": [
        {"id": "tm1", "name": "Phoebe Bridgers", "url": "https://tm.test/1",
         "dates": {"start": {"localDate": SOON, "localTime": "20:00:00"}},
         "classifications": [{"segment": {"name": "Music"}, "genre": {"name": "Rock"}}],
         "images": [{"ratio": "16_9", "width": 640, "url": "https://img.test/640.jpg"},
                    {"ratio": "16_9", "width": 1024, "url": "https://img.test/1024.jpg"}],
         "_embedded": {"venues": [{"name": "Greek Theatre", "city": {"name": "Berkeley"}, "state": {"stateCode": "CA"},
                                   "country": {"countryCode": "US"},
                                   "location": {"latitude": "37.8738", "longitude": "-122.2547"}}]}},
        {"id": "tm2", "name": "Warriors vs. Lakers", "url": "https://tm.test/2",
         "dates": {"start": {"localDate": SOON}},
         "classifications": [{"segment": {"name": "Sports"}, "genre": {"name": "Basketball"}}],
         "_embedded": {"venues": [{"name": "Chase Center", "city": {"name": "San Francisco"}, "state": {"stateCode": "CA"}}]}},
    ]}}


def seatgeek_payload():
    return {"events": [
        {"id": 9, "title": "Phoebe Bridgers", "url": "https://sg.test/9", "type": "concert",
         "datetime_local": f"{SOON}T20:00:00",
         "venue": {"name": "Greek Theatre", "city": "Berkeley", "state": "CA", "location": {"lat": 37.87, "lon": -122.25}}},
        {"id": 10, "title": "Comedy Night", "url": "https://sg.test/10", "type": "comedy",
         "datetime_local": f"{SOON}T21:00:00", "venue": {"name": "Punch Line", "city": "San Francisco", "state": "CA"}},
    ]}


def mock_http(routes):
    seen = []

    def handler(request):
        seen.append(request)
        for host, payload in routes.items():
            if request.url.host == host:
                return httpx.Response(200, json=payload)
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def test_ticketmaster_events_are_normalized():
    http, seen = mock_http({"app.ticketmaster.com": ticketmaster_payload()})
    query = ep.EventQuery(start=TODAY, end=TODAY + timedelta(days=30), city="Berkeley, CA")
    concert, game = ep.TicketmasterProvider("key", http).fetch(query)
    assert seen[0].url.params["city"] == "Berkeley" and seen[0].url.params["apikey"] == "key"
    assert concert["category"] == "music" and concert["venue"] == "Greek Theatre"
    assert concert["start"] == f"{SOON}T20:00:00" and concert["city"] == "Berkeley, CA"
    assert concert["image_url"] == "https://img.test/640.jpg" and concert["lat"] == 37.8738
    assert game["category"] == "sports" and game["all_day"] is True

    # With a location, it searches by distance instead.
    http, seen = mock_http({"app.ticketmaster.com": {"_embedded": {"events": []}}})
    ep.TicketmasterProvider("key", http).fetch(ep.EventQuery(start=TODAY, end=TODAY, lat=37.87, lon=-122.27, radius_km=25))
    assert seen[0].url.params["latlong"] == "37.8700,-122.2700" and seen[0].url.params["radius"] == "25"


def test_no_location_means_no_nationwide_listings():
    http, seen = mock_http({})
    assert ep.TicketmasterProvider("k", http).fetch(ep.EventQuery(start=TODAY, end=TODAY)) == []
    assert ep.SeatGeekProvider("k", http).fetch(ep.EventQuery(start=TODAY, end=TODAY)) == []
    assert seen == []


def test_providers_are_merged_and_deduplicated():
    http, _ = mock_http({"app.ticketmaster.com": ticketmaster_payload(), "api.seatgeek.com": seatgeek_payload()})
    providers = [ep.TicketmasterProvider("k", http), ep.SeatGeekProvider("k", http)]
    events, failed = ep.discover(providers, ep.EventQuery(start=TODAY, end=TODAY + timedelta(days=30), city="Berkeley"))
    titles = sorted(e["title"] for e in events)
    assert titles == ["Comedy Night", "Phoebe Bridgers", "Warriors vs. Lakers"]  # one Phoebe, not two
    assert failed == []
    comedy = next(e for e in events if e["title"] == "Comedy Night")
    assert comedy["category"] == "arts"


def test_a_failing_provider_is_skipped():
    class Down:
        name = "down"

        def fetch(self, query):
            raise httpx.ConnectError("nope")

    http, _ = mock_http({"api.seatgeek.com": seatgeek_payload()})
    events, failed = ep.discover([Down(), ep.SeatGeekProvider("k", http)], ep.EventQuery(start=TODAY, end=TODAY, city="SF"))
    assert failed == ["down"] and len(events) == 2


def test_categories_from_titles():
    assert ep.classify("Intro to Pottery Wheel") == "learning"
    assert ep.classify("Chemistry mixer") == "networking"
    assert ep.classify("Sunset hike at Mt Tam") == "outdoors"
    assert ep.classify("Beach cleanup volunteers") == "outdoors"
    assert ep.classify("Food bank volunteer shift") == "food" or ep.classify("Food bank volunteer shift") == "community"
    assert ep.classify("Jazz night", hint="music") == "music"
    assert ep.classify("Something") == "other"


class Sources:
    def __init__(self, events):
        self.events = events
        self.queries = []

    def discover(self, query):
        self.queries.append(query)
        return self.events, []

    def feed(self, url, label, feed_id):
        raise AssertionError("no feeds here")


class DownLLM:
    def chat_json(self, *args):
        raise LLMUnavailable("down")


def test_plan_events_filters_by_category_and_distance(db_client):
    http, _ = mock_http({"app.ticketmaster.com": ticketmaster_payload(), "api.seatgeek.com": seatgeek_payload()})
    events, _ = ep.discover([ep.TicketmasterProvider("k", http), ep.SeatGeekProvider("k", http)],
                            ep.EventQuery(start=TODAY, end=TODAY, city="x"))
    sources = Sources(events)
    plans_route._cache.clear()
    app.dependency_overrides[get_event_sources] = lambda: sources
    app.dependency_overrides[get_llm_client] = lambda: DownLLM()
    capture(db_client, {"contact": {"name": "Annie Park"}, "interaction": {"interests": ["music", "indie rock"]}})

    body = db_client.get("/plans", params={"lat": 37.87, "lon": -122.27, "radius_km": 25,
                                           "interests": "music", "days": 14}).json()
    query = sources.queries[-1]
    assert (query.lat, query.lon, query.radius_km) == (37.87, -122.27, 25)
    assert {c["key"]: c["count"] for c in body["categories"]}["music"] == 1
    concert = next(e for e in body["events"] if e["title"] == "Phoebe Bridgers")
    assert concert["where"] == "local" and concert["category"] == "music" and concert["venue"] == "Greek Theatre"
    assert [p["name"] for p in body["plans"][0]["people"]] == ["Annie Park"]
    assert body["plans"][0]["why"] == "You’re both into music."

    only_sports = db_client.get("/plans", params={"city": "San Francisco, CA", "categories": "sports"}).json()
    assert [e["title"] for e in only_sports["events"]] == ["Warriors vs. Lakers"]
