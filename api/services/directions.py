"""Turns a route into something a person can follow.

Everything here comes off the graph we already built. Where the data
does not say something we leave it out rather than guessing, which is
why steps say a distance and a heading more often than a street name.
"""

import math
from typing import Optional

# how sharp a bend has to be before it counts as a turn. edges are about
# seven metres long, so a small angle here turns ordinary path wiggle
# into a list of imaginary turns.
TURN_DEGREES = 50.0

# a walking step shorter than this is not worth its own line, so its
# distance gets folded into the step before it
MIN_STEP_M = 30.0

COMPASS = [
    "north", "northeast", "east", "southeast",
    "south", "southwest", "west", "northwest",
]

FOOTPATH = {"footway", "path", "pedestrian", "steps", "corridor"}


def bearing(a: tuple, b: tuple) -> float:
    """Compass bearing from one point to another, in degrees."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlon = lon2 - lon1
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def compass(degrees: float) -> str:
    """Nearest of the eight directions people actually say."""
    return COMPASS[int((degrees + 22.5) % 360.0 // 45.0)]


def turn_size(before: float, after: float) -> float:
    """How far the heading changed, ignoring which way it went."""
    change = abs(after - before) % 360.0
    return 360.0 - change if change > 180.0 else change


def kind_of(tags: dict) -> str:
    if tags.get("footway") == "crossing":
        return "crossing"
    if tags.get("highway") == "steps":
        return "steps"
    return "walk"


def _legs(path: list, points: list, graph) -> list:
    """Pairs each leg of the route up with the edge it used."""
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
    """Groups legs into the things a person would actually be told.

    Openstreetmap splits one road crossing into several tiny pieces, and
    a straight path into many short edges, so both get merged back.
    """
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
    """Drops walking runs too short to be worth saying.

    Their distance goes onto the step before them, so the numbers still
    add up to the length of the route.
    """
    kept = []
    for run in runs:
        if run["kind"] == "walk" and run["metres"] < MIN_STEP_M and kept:
            kept[-1]["metres"] += run["metres"]
            continue
        kept.append(run)
    return kept


def _merge_same(steps: list) -> list:
    """Two lines in a row saying the same thing read as a mistake.

    A path can bend away and bend back, which lands on the same compass
    word twice. Being told to keep going south twice helps nobody.
    """
    out = []
    for step in steps:
        last = out[-1] if out else None
        same_text = last is not None and last["text"] == step["text"]
        same_way = (
            last is not None
            and last["kind"] == "walk"
            and step["kind"] == "walk"
            and last["text"].split()[-1] == step["text"].split()[-1]
        )
        if same_text or same_way:
            out[-1]["metres"] += step["metres"]
            continue
        out.append(step)
    return out


def _side_of(building, point: tuple) -> str:
    """Which side of a building a point sits on."""
    return compass(bearing((building.lat, building.lon), point))


def build(path: list, points: list, graph, start, target) -> Optional[dict]:
    """Stats and a step list for one route.

    Returns nothing when the route is too short to describe, which keeps
    the panel from showing a single meaningless line.
    """
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

    runs = _fold_short(_runs(real))

    # a turn is a bend between two things you were told to walk along,
    # not every wiggle in the path
    turns = 0
    previous = None
    for run in runs:
        if run["kind"] != "walk":
            continue
        if previous is not None and turn_size(previous, run["heading"]) >= TURN_DEGREES:
            turns += 1
        previous = run["heading"]

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
