import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from api.routes import routing
from api.services import engine_client
from api.services.graph_data import graph_data


@pytest.fixture(scope="module")
def client():
    """The api without the engine subprocess.

    The gateway normally launches the engine on startup. Here we build a
    bare app with just the routes so the tests stay fast and offline.
    """
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(routing.router)
    graph_data.load()
    return TestClient(app)


def fake_engine_reply(**overrides):
    reply = {
        "ok": True,
        "results": [
            {
                "algorithm": "dijkstra",
                "status": "ok",
                "cost": 815.9,
                "distanceM": 815.9,
                "hops": 40,
                "nodesVisited": 2942,
                "edgesRelaxed": 9000,
                "runtimeUs": 900,
                "path": [-664275388, -19063353],
                "points": [[41.87, -87.65], [41.871, -87.651]],
            }
        ],
        "pathGroups": [{"algorithms": ["dijkstra"]}],
    }
    reply.update(overrides)
    return reply


def test_buildings_returns_the_whole_list(client):
    body = client.get("/api/buildings").json()
    assert body["count"] > 50
    assert any(b["abbr"] == "SEO" for b in body["buildings"])


def test_buildings_search_by_name(client):
    body = client.get("/api/buildings", params={"q": "lecture"}).json()
    names = [b["name"] for b in body["buildings"]]
    assert len(names) >= 6
    assert all("Lecture" in name for name in names)


def test_buildings_search_by_code_puts_the_exact_match_first(client):
    body = client.get("/api/buildings", params={"q": "seo"}).json()
    assert body["buildings"][0]["abbr"] == "SEO"


def test_buildings_search_ignores_ampersand_spelling(client):
    body = client.get("/api/buildings", params={"q": "science and engineering"}).json()
    assert body["count"] >= 1


def test_buildings_search_with_no_hits_is_empty_not_an_error(client):
    body = client.get("/api/buildings", params={"q": "zzzz nothing"}).json()
    assert body["count"] == 0
    assert body["buildings"] == []


def test_graph_meta_reports_real_counts(client):
    body = client.get("/api/graph/meta").json()
    # both campuses since round 18, so roughly double what it was
    assert body["counts"]["nodes"] > 16000
    assert body["counts"]["buildings"] == 113


def weighted_reply():
    """A walk where the weather made the going slower than the distance."""
    return fake_engine_reply(
        results=[
            {
                "algorithm": "dijkstra",
                "status": "ok",
                "cost": 1000.0,
                "distanceM": 800.0,
                "hops": 40,
                "nodesVisited": 100,
                "edgesRelaxed": 200,
                "runtimeUs": 900,
                "path": [-664275388, -19063353],
                "points": [[41.87, -87.65], [41.871, -87.651]],
            }
        ]
    )


def test_weather_times_the_slower_walk_and_not_the_bare_distance(client, monkeypatch):
    def capture(start, target, algorithms, cost, trace=False, max_trace_samples=None):
        return weighted_reply()

    monkeypatch.setattr(engine_client, "route", capture)
    monkeypatch.setattr(
        routing.weather_cache, "get_or_none",
        lambda: {"tempC": -3.0, "condition": "Snow"},
    )
    body = client.post(
        "/api/route", json={"start": "ARC", "target": "SES", "mode": "weather"}
    ).json()

    speed = body["cost"]["walkingSpeedMps"]
    assert body["cost"]["speedDerived"] is True
    # 1000 weighted metres, not the 800 real ones
    assert body["results"][0]["estSeconds"] == round(1000.0 / speed)


def test_accessible_times_the_real_distance(client, monkeypatch):
    """The 1.5 on rough ground is a preference, not a measured speed.

    Timing the weighted cost there would invent a slower walk out of a
    routing nudge.
    """
    def capture(start, target, algorithms, cost, trace=False, max_trace_samples=None):
        return weighted_reply()

    monkeypatch.setattr(engine_client, "route", capture)
    body = client.post(
        "/api/route", json={"start": "ARC", "target": "SES", "mode": "accessible"}
    ).json()

    speed = body["cost"]["walkingSpeedMps"]
    assert body["cost"]["speedDerived"] is False
    assert body["results"][0]["estSeconds"] == round(800.0 / speed)


def test_shortest_is_unaffected(client, monkeypatch):
    def capture(start, target, algorithms, cost, trace=False, max_trace_samples=None):
        return weighted_reply()

    monkeypatch.setattr(engine_client, "route", capture)
    body = client.post("/api/route", json={"start": "ARC", "target": "SES"}).json()
    speed = body["cost"]["walkingSpeedMps"]
    assert body["results"][0]["estSeconds"] == round(800.0 / speed)


def test_weather_failure_never_shows_the_api_key(client, monkeypatch):
    """The one that could actually lose something.

    httpx puts the whole request url in its error text and ours carries
    the key, so the public reason has to be a fixed string.
    """
    import httpx

    from api.services import weather as weather_module

    secret = "SUPERSECRETKEY1234567890abcdef"
    monkeypatch.setattr(weather_module.settings, "openweather_api_key", secret)

    # let httpx build the error itself, since the leak is that its own
    # message carries the whole url. constructing one by hand would test
    # nothing.
    request = httpx.Request("GET", f"https://api.openweathermap.org/x?appid={secret}")
    response = httpx.Response(401, request=request)
    try:
        response.raise_for_status()
        raise AssertionError("401 should have raised")
    except httpx.HTTPStatusError as raised:
        boom = raised
    assert secret in str(boom), "the leak this test guards against is gone"

    def explode(*args, **kwargs):
        raise boom

    monkeypatch.setattr(weather_module.httpx, "get", explode)
    fresh = weather_module.WeatherCache()
    monkeypatch.setattr(weather_module, "weather_cache", fresh)
    monkeypatch.setattr(routing, "weather_cache", fresh)

    body = client.get("/api/weather").json()
    assert body["available"] is False
    assert secret not in str(body)
    assert body["reason"] == "weather service returned 401"


def test_redact_takes_the_key_out_of_anything():
    from api.services import weather as weather_module

    weather_module.settings.openweather_api_key = "abc123"
    assert weather_module.redact("url?appid=abc123&x=1") == "url?appid=REDACTED&x=1"


def test_route_caps_the_algorithm_list(client):
    """Five thousand searches in one request used to be allowed."""
    reply = client.post(
        "/api/route",
        json={"start": "ARC", "target": "SES", "algorithms": ["bfs"] * 5000},
    )
    assert reply.status_code == 422


def test_route_runs_a_repeated_algorithm_once(client, monkeypatch):
    seen = {}

    def capture(start, target, algorithms, cost, trace=False, max_trace_samples=None):
        seen["algorithms"] = algorithms
        return fake_engine_reply()

    monkeypatch.setattr(engine_client, "route", capture)
    client.post(
        "/api/route",
        json={"start": "ARC", "target": "SES", "algorithms": ["bfs", "bfs", "astar", "bfs"]},
    )
    assert seen["algorithms"] == ["bfs", "astar"]


def test_route_rejects_an_absurd_trace_cap(client):
    reply = client.post(
        "/api/route",
        json={"start": "ARC", "target": "SES", "maxTraceSamples": 10 ** 18},
    )
    assert reply.status_code == 422


def guarded_app():
    """The shared fixture is a bare app, so mount the guard on its own."""
    from fastapi import FastAPI

    from api.main import MAX_BODY_BYTES, BodySizeLimit

    app = FastAPI()
    app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)

    @app.post("/echo")
    def echo():
        return {"ok": True}

    return TestClient(app), MAX_BODY_BYTES


def test_a_huge_body_is_refused():
    client, cap = guarded_app()
    big = client.post(
        "/echo", content=b"x" * (cap + 100), headers={"Content-Type": "application/json"}
    )
    assert big.status_code == 413
    assert client.post("/echo", json={}).status_code == 200


def test_a_body_that_hides_its_size_is_also_refused():
    """Chunked sends no content-length, and used to walk straight past."""
    client, cap = guarded_app()

    def chunks():
        for _ in range((cap // 1024) + 4):
            yield b"x" * 1024

    reply = client.post(
        "/echo", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert reply.status_code == 413


def test_a_lying_content_length_is_refused():
    client, _ = guarded_app()
    reply = client.post(
        "/echo", content=b"{}", headers={"Content-Length": "not a number"}
    )
    assert reply.status_code in (400, 422)


def test_search_refuses_an_enormous_query(client):
    assert client.get("/api/buildings", params={"q": "a" * 5000}).status_code == 422


def test_the_rate_limiter_actually_limits():
    """It never did, on any route added by include_router.

    Fastapi wraps those in a router object with no endpoint attribute, so
    slowapi's route lookup found nothing and called every request exempt.
    """
    from fastapi import FastAPI

    from api.main import RateLimit

    app = FastAPI()
    app.add_middleware(RateLimit, limit=5, window_s=60.0)
    router_side = APIRouter(prefix="/api")

    @router_side.get("/thing")
    def thing():
        return {"ok": True}

    # added the same way the real routes are, since that is what broke
    app.include_router(router_side)

    client = TestClient(app)
    codes = [client.get("/api/thing").status_code for _ in range(9)]
    assert codes.count(200) == 5, f"expected five through, got {codes}"
    assert codes.count(429) == 4


def test_the_window_reopens():
    from api.main import RateLimit

    guard = RateLimit(None, limit=2, window_s=10.0)
    assert guard.allow("a", 100.0) and guard.allow("a", 100.1)
    assert not guard.allow("a", 100.2)
    # a different caller has their own allowance
    assert guard.allow("b", 100.2)
    # and the window comes round again
    assert guard.allow("a", 111.0)


def test_forwarded_for_uses_the_entry_our_proxy_added():
    """The first entry is whatever the caller typed, so keying on it would
    hand a fresh allowance to anyone who sends the header."""
    from api import main

    def scope(value):
        return {"headers": [(b"x-forwarded-for", value.encode())],
                "client": ("10.0.0.1", 1234)}

    main.settings.trust_proxy_headers = True
    try:
        assert main.client_address(scope("1.2.3.4, 9.9.9.9")) == "9.9.9.9"
        assert main.client_address(scope("9.9.9.9")) == "9.9.9.9"
    finally:
        main.settings.trust_proxy_headers = False
    # and without a proxy in front we ignore the header entirely
    assert main.client_address(scope("1.2.3.4")) == "10.0.0.1"


def test_rate_strings_are_read_properly():
    from api.main import parse_rate

    assert parse_rate("60/minute") == (60, 60.0)
    assert parse_rate("5/second") == (5, 1.0)
    assert parse_rate("100/hour") == (100, 3600.0)
    for bad in ("60", "60/fortnight", "many/minute"):
        try:
            parse_rate(bad)
            raise AssertionError(f"{bad} should not parse")
        except ValueError:
            pass


def test_route_rejects_a_bad_mode(client):
    reply = client.post("/api/route", json={"start": "SEO", "target": "LCC", "mode": "fly"})
    assert reply.status_code == 400


def test_route_rejects_an_unknown_algorithm(client):
    reply = client.post(
        "/api/route",
        json={"start": "SEO", "target": "LCC", "algorithms": ["dijkstra", "magic"]},
    )
    assert reply.status_code == 400


def test_route_rejects_an_empty_algorithm_list(client):
    reply = client.post(
        "/api/route", json={"start": "SEO", "target": "LCC", "algorithms": []}
    )
    assert reply.status_code == 400


def test_route_reports_an_unknown_building(client):
    reply = client.post("/api/route", json={"start": "NOPE", "target": "LCC"})
    assert reply.status_code == 404
    assert "NOPE" in reply.json()["detail"]


def test_route_passes_the_cost_model_to_the_engine(client, monkeypatch):
    seen = {}

    def capture(start, target, algorithms, cost, trace=False, max_trace_samples=None):
        seen["cost"] = cost
        seen["start"] = start
        return fake_engine_reply()

    monkeypatch.setattr(engine_client, "route", capture)
    reply = client.post(
        "/api/route", json={"start": "ARC", "target": "SES", "mode": "accessible"}
    )

    assert reply.status_code == 200
    # steps really are blocked on the way through
    assert any("steps" in blocked for blocked in seen["cost"]["blocked"])
    assert seen["start"] == -664275388


def test_route_does_not_cap_the_trace_by_default(client, monkeypatch):
    """The gateway must not quietly shrink the search.

    Thinning drops points, and a path needs both of its ends, so a cap
    here loses roughly the square of what it looks like. A default of
    1500 here once cut dijkstra down to 17% of its own search.
    """
    seen = {}

    def capture(start, target, algorithms, cost, trace=False, max_trace_samples=None):
        seen["limit"] = max_trace_samples
        return fake_engine_reply()

    monkeypatch.setattr(engine_client, "route", capture)
    client.post("/api/route", json={"start": "ARC", "target": "SES", "trace": True})

    assert seen["limit"] is None


def test_route_still_passes_a_cap_when_one_is_asked_for(client, monkeypatch):
    seen = {}

    def capture(start, target, algorithms, cost, trace=False, max_trace_samples=None):
        seen["limit"] = max_trace_samples
        return fake_engine_reply()

    monkeypatch.setattr(engine_client, "route", capture)
    client.post(
        "/api/route",
        json={"start": "ARC", "target": "SES", "trace": True, "maxTraceSamples": 50},
    )

    assert seen["limit"] == 50


def test_engine_client_omits_the_cap_rather_than_sending_a_null(monkeypatch):
    """The engine reads a missing key as its own default.

    Sending null instead would not parse as a number and the cap would
    be silently ignored, which is a different bug with the same look.
    """
    sent = {}

    class Reply:
        status_code = 200

        @staticmethod
        def json():
            return {"ok": True, "results": [], "pathGroups": []}

    def fake_post(url, json=None):
        sent.update(json)
        return Reply()

    # the client is built once and reused, so patch the instance rather
    # than httpx itself
    monkeypatch.setattr(engine_client._client, "post", fake_post)
    engine_client.route(-1, -2, ["astar"], {"multipliers": {}, "blocked": []}, trace=True)

    assert "maxTraceSamples" not in sent


def test_route_adds_a_time_estimate_from_the_published_speed(client, monkeypatch):
    monkeypatch.setattr(
        engine_client, "route", lambda *a, **k: fake_engine_reply()
    )
    body = client.post("/api/route", json={"start": "ARC", "target": "SES"}).json()

    result = body["results"][0]
    # 815.9 metres at 1.607 metres a second
    assert result["estSeconds"] == pytest.approx(508, abs=2)
    assert body["cost"]["walkingSpeedMps"] == pytest.approx(1.607, abs=0.01)


def test_route_keeps_no_path_as_a_normal_answer(client, monkeypatch):
    stranded = fake_engine_reply(
        results=[{"algorithm": "dijkstra", "status": "no_path", "nodesVisited": 12,
                  "edgesRelaxed": 20, "runtimeUs": 50}],
        pathGroups=[],
    )
    monkeypatch.setattr(engine_client, "route", lambda *a, **k: stranded)

    reply = client.post(
        "/api/route", json={"start": "ARC", "target": "SES", "mode": "accessible"}
    )
    assert reply.status_code == 200
    assert reply.json()["results"][0]["status"] == "no_path"
    # nothing to estimate a time for
    assert "estSeconds" not in reply.json()["results"][0]


def test_route_returns_503_when_the_engine_is_down(client, monkeypatch):
    def boom(*args, **kwargs):
        raise engine_client.EngineUnavailable("connection refused")

    monkeypatch.setattr(engine_client, "route", boom)
    reply = client.post("/api/route", json={"start": "ARC", "target": "SES"})
    assert reply.status_code == 503


def test_route_passes_through_an_engine_rejection(client, monkeypatch):
    def rejected(*args, **kwargs):
        raise engine_client.EngineRejected(404, "start node is not in the graph")

    monkeypatch.setattr(engine_client, "route", rejected)
    reply = client.post("/api/route", json={"start": "ARC", "target": "SES"})
    assert reply.status_code == 404


def test_weather_mode_still_routes_when_weather_is_missing(client, monkeypatch):
    monkeypatch.setattr(engine_client, "route", lambda *a, **k: fake_engine_reply())
    monkeypatch.setattr(
        "api.routes.routing.weather_cache.get_or_none", lambda: None
    )

    body = client.post(
        "/api/route", json={"start": "ARC", "target": "SES", "mode": "weather"}
    ).json()

    assert body["weather"] is None
    assert any("unavailable" in note for note in body["cost"]["notes"])


def test_weather_endpoint_says_so_when_it_cannot_help(client, monkeypatch):
    monkeypatch.setattr(
        "api.routes.routing.weather_cache.get_or_none", lambda: None
    )
    body = client.get("/api/weather").json()
    assert body["available"] is False
