import pytest
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
    assert body["counts"]["nodes"] > 8000
    assert body["counts"]["buildings"] == 59


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
