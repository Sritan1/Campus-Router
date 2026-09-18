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
    # anything longer than this is somebody poking at the api
    start: str = Field(description="building id, code or node id", max_length=120)
    target: str = Field(description="building id, code or node id", max_length=120)
    mode: str = Field(default="shortest", max_length=40)

    # capped here and deduplicated below, or one request buys thousands of searches
    algorithms: list[str] = Field(
        default_factory=lambda: list(ALGORITHMS), max_length=len(ALGORITHMS)
    )
    trace: bool = False

    # unset on purpose, since thinning shreds the search. the floor is one because
    # the engine reads zero as no limit at all
    maxTraceSamples: Optional[int] = Field(default=None, ge=1, le=200_000)


@router.get("/buildings")
def buildings(limit: int = Query(default=200, ge=1, le=500)):
    """The whole building list, filtered in the browser."""
    graph_data.load()
    found = graph_data.buildings[:limit]
    return {"count": len(found), "buildings": [b.as_dict() for b in found]}


@router.get("/graph/meta")
def graph_meta():
    """Graph counts, bounds and the date the map data was downloaded."""
    graph_data.load()
    return {
        "counts": graph_data.meta.get("counts", {}),
        "campusBounds": graph_data.meta.get("campus_bounds"),
        "classes": len(graph_data.classes),
        # read off the graph, so the about page date cannot drift
        "extracted": graph_data.meta.get("extracted"),
    }


@router.get("/weather")
def weather():
    """Current conditions. Never fails the whole page when it is missing."""
    value = weather_cache.get_or_none()
    if value is None:
        return {"available": False, "reason": weather_cache.last_error or "unavailable"}
    return {"available": True, **value}


class IsochroneRequest(BaseModel):
    start: str = Field(description="building id, code or node id", max_length=120)
    mode: str = Field(default="shortest", max_length=40)
    minutes: float = Field(default=10.0, gt=0, le=60)


@router.post("/isochrone")
def isochrone(request: IsochroneRequest):
    """Everywhere you can walk to from here inside a time budget."""
    graph_data.load()

    if request.mode not in MODES:
        raise HTTPException(400, f"Mode must be one of {', '.join(MODES)}.")

    start = graph_data.resolve(request.start)
    if start is None:
        raise HTTPException(404, f"We could not find {request.start} on campus.")

    current = weather_cache.get_or_none() if request.mode == "weather" else None
    cost = cost_model.build(request.mode, graph_data.classes, current)

    # the engine works in metres, so turn the time budget into a distance
    speed = cost["walkingSpeedMps"]
    limit_m = request.minutes * 60.0 * speed

    try:
        reply = engine_client.isochrone(start.node_id, limit_m, cost)
    except engine_client.EngineOutOfDate as exc:
        # a build problem, so the detail goes to the log and not the visitor
        log.error("%s. rebuild the engine and restart the gateway", exc)
        raise HTTPException(503, "This is not available right now.") from exc
    except engine_client.EngineRejected as exc:
        # engine wording is about json and node ids and means we sent it junk
        log.error("engine rejected the request: %s", exc.message)
        raise HTTPException(exc.status, "We could not work that out.") from exc
    except engine_client.EngineUnavailable as exc:
        log.error("engine unavailable: %s", exc)
        raise HTTPException(503, "The routing service is not responding.") from exc

    # buildings are nodes too, so pick out the ones the search reached
    costs = reply.get("costs", [])
    reached_buildings = []
    for node_id, cost_m in zip(reply.get("ids", []), costs):
        building = graph_data.by_node.get(node_id)
        # the start used to show up as a one minute walk from itself
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
        raise HTTPException(400, f"Mode must be one of {', '.join(MODES)}.")

    unknown = [a for a in request.algorithms if a not in ALGORITHMS]
    if unknown:
        raise HTTPException(400, f"We do not have an algorithm called {', '.join(unknown)}.")
    if not request.algorithms:
        raise HTTPException(400, "Pick at least one algorithm.")

    # keep the first of each, in the order asked
    wanted = list(dict.fromkeys(request.algorithms))

    start = graph_data.resolve(request.start)
    target = graph_data.resolve(request.target)
    if start is None:
        raise HTTPException(404, f"We could not find {request.start} on campus.")
    if target is None:
        raise HTTPException(404, f"We could not find {request.target} on campus.")

    current = weather_cache.get_or_none() if request.mode == "weather" else None
    cost = cost_model.build(request.mode, graph_data.classes, current)

    if request.mode == "weather" and current is None:
        # shown word for word, so match the voice of the notes in cost_model
        cost["notes"].append("Weather is unavailable. Routing on shortest distance instead.")

    try:
        engine_reply = engine_client.route(
            start.node_id,
            target.node_id,
            wanted,
            cost,
            trace=request.trace,
            max_trace_samples=request.maxTraceSamples,
        )
    except engine_client.EngineOutOfDate as exc:
        log.error("%s. rebuild the engine and restart the gateway", exc)
        raise HTTPException(503, "This is not available right now.") from exc
    except engine_client.EngineRejected as exc:
        log.error("engine rejected the request: %s", exc.message)
        raise HTTPException(exc.status, "We could not work that route out.") from exc
    except engine_client.EngineUnavailable as exc:
        log.error("engine unavailable: %s", exc)
        raise HTTPException(503, "The routing service is not responding.") from exc

    speed = cost["walkingSpeedMps"]
    results = []
    for entry in engine_reply.get("results", []):
        item = dict(entry)
        if entry.get("status") == "ok" and entry.get("distanceM") is not None:
            # weather mode times the weighted cost, or it would route around ice
            # and still promise the bare pavement time
            metres = entry["distanceM"]
            if cost.get("speedDerived") and entry.get("cost") is not None:
                metres = entry["cost"]
            item["estSeconds"] = round(metres / speed)
        results.append(item)

    # directions follow the first exact algorithm, they all agree on cost anyway
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
            # whether estSeconds used the weighted walk or the plain one
            "speedDerived": cost["speedDerived"],
        },
        "weather": current,
    }
