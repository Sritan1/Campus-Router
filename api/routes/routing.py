"""The public api the frontend talks to."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.services import cost_model, directions, engine_client
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

    # left unset on purpose. thinning drops points, and a path needs both
    # of its ends, so a limit here quietly shreds the search into pieces.
    # the engine has a sane cap of its own for absurd cases.
    maxTraceSamples: Optional[int] = None


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


class IsochroneRequest(BaseModel):
    start: str = Field(description="building id, code or node id")
    mode: str = "shortest"
    minutes: float = Field(default=10.0, gt=0, le=60)


@router.post("/isochrone")
def isochrone(request: IsochroneRequest):
    """Everywhere you can walk to from here inside a time budget."""
    graph_data.load()

    if request.mode not in MODES:
        raise HTTPException(400, f"mode must be one of {', '.join(MODES)}")

    start = graph_data.resolve(request.start)
    if start is None:
        raise HTTPException(404, f"no building matching {request.start}")

    current = weather_cache.get_or_none() if request.mode == "weather" else None
    cost = cost_model.build(request.mode, graph_data.classes, current)

    # the engine works in weighted metres, so a time budget becomes a
    # distance one through the walking speed the cost model already uses
    speed = cost["walkingSpeedMps"]
    limit_m = request.minutes * 60.0 * speed

    try:
        reply = engine_client.isochrone(start.node_id, limit_m, cost)
    except engine_client.EngineOutOfDate as exc:
        # a build problem, so the detail belongs in the log and not in
        # front of whoever is using the site
        log.error("%s. rebuild the engine and restart the gateway", exc)
        raise HTTPException(503, "that is not available right now") from exc
    except engine_client.EngineRejected as exc:
        raise HTTPException(exc.status, exc.message) from exc
    except engine_client.EngineUnavailable as exc:
        log.error("engine unavailable: %s", exc)
        raise HTTPException(503, "the routing engine is not responding") from exc

    # buildings are nodes too, so anything the search reached that has a
    # negative id is somewhere you could actually walk to
    costs = reply.get("costs", [])
    reached_buildings = []
    for node_id, cost_m in zip(reply.get("ids", []), costs):
        building = graph_data.by_node.get(node_id)
        # where you already are is not somewhere you can get to, and it
        # showed up in the list as a one minute walk
        if building is not None and building.node_id != start.node_id:
            reached_buildings.append(
                {**building.as_dict(), "seconds": round(cost_m / speed)}
            )
    reached_buildings.sort(key=lambda b: b["seconds"])

    return {
        "start": start.as_dict(),
        "mode": request.mode,
        "minutes": request.minutes,
        "walkingSpeedMps": speed,
        "points": reply.get("points", []),
        "edges": reply.get("edges", []),
        # seconds rather than weighted metres, which is what the ui shows
        "edgeSeconds": [c / speed for c in reply.get("edgeCosts", [])],
        "buildings": reached_buildings,
        "reached": len(reply.get("points", [])),
        "runtimeUs": reply.get("runtimeUs", 0),
    }


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
    except engine_client.EngineOutOfDate as exc:
        # a build problem, so the detail belongs in the log and not in
        # front of whoever is using the site
        log.error("%s. rebuild the engine and restart the gateway", exc)
        raise HTTPException(503, "that is not available right now") from exc
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
            # in weather mode the weighted cost is already the slower walk,
            # so timing the plain distance would reroute you around ice and
            # then promise the same time as bare pavement
            metres = entry["distanceM"]
            if cost.get("speedDerived") and entry.get("cost") is not None:
                metres = entry["cost"]
            item["estSeconds"] = round(metres / speed)
        results.append(item)

    # walking directions describe one route, so they follow whichever
    # exact algorithm answered. the three of them agree on cost anyway.
    guide = None
    for item in results:
        if item.get("status") == "ok" and item.get("algorithm") != "bfs":
            guide = directions.build(
                item.get("path") or [],
                item.get("points") or [],
                graph_data,
                start,
                target,
            )
            if guide:
                break

    return {
        "start": start.as_dict(),
        "target": target.as_dict(),
        "mode": request.mode,
        "results": results,
        "directions": guide,
        "pathGroups": engine_reply.get("pathGroups", []),
        "cost": {
            "source": cost["source"],
            "notes": cost["notes"],
            "blockedClasses": len(cost["blocked"]),
            "adjustedClasses": len(cost["multipliers"]),
            "walkingSpeedMps": speed,
            # says whether estSeconds was timed on the weighted walk or
            # the plain one, which is the difference between the modes
            "speedDerived": cost["speedDerived"],
        },
        "weather": current,
    }
