"""Round 0 spike. Asks Overpass what accessibility tags UIC footpaths carry.

The whole Accessible mode depends on this, so we measure it before
building anything on top of it.
"""

import collections
import json
import pathlib
import sys

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# overpass rejects unlabelled clients, so we say who we are
HEADERS = {"User-Agent": "campus-router/0.1 (student project, contact via github Sritan1)"}

# generous box around the UIC east and west campus
BBOX = (41.8620, -87.6560, 41.8800, -87.6400)

CACHE_DIR = pathlib.Path(__file__).resolve().parent / ".cache"

WALKABLE = "footway|path|steps|pedestrian|corridor|living_street|service|residential"

WAY_QUERY = f"""
[out:json][timeout:90];
way["highway"~"^({WALKABLE})$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
out tags;
"""

BUILDING_QUERY = f"""
[out:json][timeout:90];
way["building"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
out tags;
"""

# the tags that actually drive routing cost later
TAGS_OF_INTEREST = [
    "wheelchair",
    "surface",
    "incline",
    "lit",
    "covered",
    "tactile_paving",
    "smoothness",
    "width",
    "ramp",
    "handrail",
]


def fetch(name: str, query: str) -> dict:
    """Runs a query and caches the raw reply so reruns are free."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"{name}.json"
    if cached.exists():
        print(f"using cached {cached.name}")
        return json.loads(cached.read_text(encoding="utf-8"))

    print(f"asking overpass for {name} ...")
    reply = httpx.post(OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=120)
    reply.raise_for_status()

    # a non json 200 is a real overpass failure mode, so catch it here
    try:
        payload = reply.json()
    except ValueError as exc:
        raise RuntimeError(f"overpass returned non json for {name}") from exc

    cached.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def pct(part: int, whole: int) -> str:
    if whole == 0:
        return "n/a"
    return f"{100.0 * part / whole:.1f}%"


def report_ways(payload: dict) -> None:
    ways = payload.get("elements", [])
    total = len(ways)
    print(f"\nwalkable ways in bbox: {total}")

    highway_counts = collections.Counter(w.get("tags", {}).get("highway") for w in ways)
    print("\nby highway type")
    for value, count in highway_counts.most_common():
        print(f"  {value:<16} {count:>6}  {pct(count, total)}")

    print("\naccessibility tag coverage")
    for tag in TAGS_OF_INTEREST:
        have = sum(1 for w in ways if tag in w.get("tags", {}))
        print(f"  {tag:<16} {have:>6}  {pct(have, total)}")

    print("\nvalues seen for the tags that matter most")
    for tag in ("wheelchair", "surface", "incline"):
        values = collections.Counter(
            w["tags"][tag] for w in ways if tag in w.get("tags", {})
        )
        if not values:
            print(f"  {tag}: none")
            continue
        shown = ", ".join(f"{v} x{c}" for v, c in values.most_common(8))
        print(f"  {tag}: {shown}")

    steps = highway_counts.get("steps", 0)
    print(f"\nsteps ways: {steps}  ({pct(steps, total)} of walkable ways)")


def report_buildings(payload: dict) -> None:
    buildings = payload.get("elements", [])
    total = len(buildings)
    named = sum(1 for b in buildings if b.get("tags", {}).get("name"))
    wheels = sum(1 for b in buildings if "wheelchair" in b.get("tags", {}))
    entrances = sum(1 for b in buildings if "entrance" in b.get("tags", {}))

    print(f"\nbuildings in bbox: {total}")
    print(f"  named            {named:>6}  {pct(named, total)}")
    print(f"  wheelchair tag   {wheels:>6}  {pct(wheels, total)}")
    print(f"  entrance tag     {entrances:>6}  {pct(entrances, total)}")


def main() -> int:
    try:
        ways = fetch("ways", WAY_QUERY)
        buildings = fetch("buildings", BUILDING_QUERY)
    except (httpx.HTTPError, RuntimeError) as exc:
        print(f"overpass failed: {exc}", file=sys.stderr)
        return 1

    report_ways(ways)
    report_buildings(buildings)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
