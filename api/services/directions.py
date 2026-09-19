"""Turns a route into stats and steps, using only what the graph actually says."""

import math
from typing import Optional

# edges are about seven metres, so a small angle turns path wiggle into fake turns
TURN_DEGREES = 50.0

# shorter walking steps fold into the one before
MIN_STEP_M = 30.0

COMPASS = [
    "north", "northeast", "east", "southeast",
    "south", "southwest", "west", "northwest",
]

FOOTPATH = {"footway", "path", "pedestrian", "steps", "corridor"}


def bearing(a: tuple, b: tuple) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlon = lon2 - lon1
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def compass(degrees: float) -> str:
    return COMPASS[int((degrees + 22.5) % 360.0 // 45.0)]


def turn_size(before: float, after: float) -> float:
    change = abs(after - before) % 360.0
    return 360.0 - change if change > 180.0 else change


def kind_of(tags: dict) -> str:
    if tags.get("footway") == "crossing":
        return "crossing"
    if tags.get("highway") == "steps":
        return "steps"
    return "walk"


def _legs(path: list, points: list, graph) -> list:
    legs = []
    for i in range(len(path) - 1):
        edge = graph.edge_between(path[i], path[i + 1])
        if edge is None:
            continue
        legs.append(
            {
                "from": tuple(points[i]),
                "to": tuple(points[i + 1]),
                "metres": edge["length_m"],
                "tags": edge.get("tags", {}),
            }
        )
    return legs


def _runs(legs: list) -> list:
    # osm splits a crossing into tiny pieces and a straight path into short
    # edges, so both get merged back
    runs = []
    for leg in legs:
        kind = kind_of(leg["tags"])
        here = bearing(leg["from"], leg["to"])
        last = runs[-1] if runs else None

        if last and last["kind"] == kind and kind in ("crossing", "steps"):
            last["metres"] += leg["metres"]
            if kind == "crossing" and not last["street"]:
                last["street"] = leg["tags"].get("crosses")
            continue

        if (
            last
            and last["kind"] == "walk"
            and kind == "walk"
            and turn_size(last["heading"], here) < TURN_DEGREES
        ):
            last["metres"] += leg["metres"]
            continue

        runs.append(
            {
                "kind": kind,
                "metres": leg["metres"],
                "heading": here,
                "street": leg["tags"].get("crosses") if kind == "crossing" else None,
            }
        )
    return runs


def _fold_short(runs: list) -> list:
    # the distance moves onto the step before, so steps still add up to the route
    kept = []
    for run in runs:
        if run["kind"] == "walk" and run["metres"] < MIN_STEP_M and kept:
            kept[-1]["metres"] += run["metres"]
            continue
        kept.append(run)
    return kept


def _merge_same(steps: list) -> list:
    # bending away and back can land on the same compass word twice
    out = []
    for step in steps:
        last = out[-1] if out else None
        # walking only, merging crossings made the crossings stat disagree with the list
        same_way = (
            last is not None
            and last["kind"] == "walk"
            and step["kind"] == "walk"
            and last["text"].split()[-1] == step["text"].split()[-1]
        )
        if same_way:
            out[-1]["metres"] += step["metres"]
            continue
        out.append(step)
    return out


def _side_of(building, point: tuple) -> str:
    return compass(bearing((building.lat, building.lon), point))


def build(path: list, points: list, graph, start, target) -> Optional[dict]:
    if not path or len(path) < 2 or len(points) != len(path):
        return None

    legs = _legs(path, points, graph)
    real = [leg for leg in legs if leg["tags"].get("highway")]
    if not real:
        return None

    total = sum(leg["metres"] for leg in real) or 1.0
    on_foot = sum(
        leg["metres"] for leg in real if leg["tags"].get("highway") in FOOTPATH
    )

    merged = _runs(real)

    # count turns before folding. folding is only for readability, and counting
    # after it threw most of the real turns away
    turns = 0
    previous = None
    for run in merged:
        if run["kind"] != "walk":
            continue
        if previous is not None and turn_size(previous, run["heading"]) >= TURN_DEGREES:
            turns += 1
        previous = run["heading"]

    runs = _fold_short(merged)

    steps = [
        {
            "text": f"Leave {start.abbr or start.name} on the {_side_of(start, real[0]['from'])} side",
            "metres": round(legs[0]["metres"]) if legs else 0,
            "kind": "start",
        }
    ]

    first_walk = True
    for run in runs:
        if run["kind"] == "crossing":
            street = run["street"]
            text = f"Cross {street}" if street else "Cross the road"
        elif run["kind"] == "steps":
            text = "Take the steps"
        else:
            where = compass(run["heading"])
            text = f"Head {where}" if first_walk else f"Continue {where}"
            first_walk = False
        steps.append({"text": text, "metres": round(run["metres"]), "kind": run["kind"]})

    steps.append(
        {
            "text": f"Arrive at {target.abbr or target.name}, {_side_of(target, real[-1]['to'])} side",
            "metres": round(legs[-1]["metres"]) if legs else 0,
            "kind": "end",
        }
    )

    return {
        "turns": turns,
        "crossings": sum(1 for run in runs if run["kind"] == "crossing"),
        "onFootpath": round(100.0 * on_foot / total),
        "steps": _merge_same(steps),
    }
