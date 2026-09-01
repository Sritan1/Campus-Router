"""The public api the frontend talks to."""

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.services import cost_model, engine_client
from api.services.graph_data import graph_data
from api.services.weather import weather_cache

log = logging.getLogger("api")
router = APIRouter(prefix="/api")

ALGORITHMS = ["dijkstra", "astar", "bfs", "bidirectional"]
MODES = ["shortest", "accessible", "weather"]


class RouteRequest(BaseModel):
    start: str = Field(description="building id, code or node id")
    target: str = Field(description="building id, code or node id")
    mode: str = "shortest"
    algorithms: list[str] = Field(default_factory=lambda: list(ALGORITHMS))
    trace: bool = False
    maxTraceSamples: int = 1500


@router.get("/buildings")
def buildings(
    q: str = Query(default="", description="search text"),
    limit: int = Query(default=200, ge=1, le=500),
):
    """Everything the search box needs."""
    graph_data.load()
    found = graph_data.search(q, limit) if q else graph_data.buildings[:limit]
    return {"count": len(found), "buildings": [b.as_dict() for b in found]}


@router.get("/graph/meta")
def graph_meta():
    """Real counts for the map chip, not numbers typed into a mock."""
    graph_data.load()
    return {
        "counts": graph_data.meta.get("counts", {}),
        "campusBounds": graph_data.meta.get("campus_bounds"),
        "classes": len(graph_data.classes),
    }


@router.get("/weather")
def weather():
    """Current conditions. Never fails the whole page when it is missing."""
    value = weather_cache.get_or_none()
    if value is None:
        return {"available": False, "reason": weather_cache.last_error or "unavailable"}
    return {"available": True, **value}


@router.post("/route")
def route(request: RouteRequest):
    graph_data.load()

    if request.mode not in MODES:
        raise HTTPException(400, f"mode must be one of {', '.join(MODES)}")

    unknown = [a for a in request.algorithms if a not in ALGORITHMS]
    if unknown:
        raise HTTPException(400, f"unknown algorithms {', '.join(unknown)}")
    if not request.algorithms:
        raise HTTPException(400, "pick at least one algorithm")

    start = graph_data.resolve(request.start)
    target = graph_data.resolve(request.target)
    if start is None:
        raise HTTPException(404, f"no building matching {request.start}")
    if target is None:
        raise HTTPException(404, f"no building matching {request.target}")

    # weather mode needs weather, the others do not care
    current = weather_cache.get_or_none() if request.mode == "weather" else None
    cost = cost_model.build(request.mode, graph_data.classes, current)

    if request.mode == "weather" and current is None:
        cost["notes"].append("weather is unavailable, routing as shortest distance")

    try:
        engine_reply = engine_client.route(
            start.node_id,
            target.node_id,
            request.algorithms,
            cost,
            trace=request.trace,
            max_trace_samples=request.maxTraceSamples,
        )
    except engine_client.EngineRejected as exc:
        raise HTTPException(exc.status, exc.message) from exc
    except engine_client.EngineUnavailable as exc:
        log.error("engine unavailable: %s", exc)
        raise HTTPException(503, "the routing engine is not responding") from exc

    speed = cost["walkingSpeedMps"]
    results = []
    for entry in engine_reply.get("results", []):
        item = dict(entry)
        if entry.get("status") == "ok" and entry.get("distanceM") is not None:
            item["estSeconds"] = round(entry["distanceM"] / speed)
        results.append(item)

    return {
        "start": start.as_dict(),
        "target": target.as_dict(),
        "mode": request.mode,
        "results": results,
        "pathGroups": engine_reply.get("pathGroups", []),
        "cost": {
            "source": cost["source"],
            "notes": cost["notes"],
            "blockedClasses": len(cost["blocked"]),
            "adjustedClasses": len(cost["multipliers"]),
            "walkingSpeedMps": speed,
        },
        "weather": current,
    }
