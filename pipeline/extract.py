"""Pulls raw campus data from Overpass.

Paths come from a slightly buffered box around campus so that sidewalks
just off the edge still connect. Buildings come from the campus polygon
itself so search does not fill up with nearby businesses.
"""

import argparse
import json
import pathlib

from pipeline import overpass

# the east campus, as mapped in openstreetmap
CAMPUS_RELATION = 19755400

# roughly 110 metres of slack around the campus edge
BBOX_BUFFER_DEG = 0.001

WALKABLE = "footway|path|steps|pedestrian|corridor|living_street|service|residential"

RAW_DIR = pathlib.Path(__file__).resolve().parent / "raw"


def campus_bounds() -> dict:
    """Asks openstreetmap where campus actually is instead of guessing."""
    query = f"""[out:json][timeout:120];
rel({CAMPUS_RELATION});
out tags bb;"""
    payload = overpass.run("campus_bounds", query)

    elements = payload.get("elements", [])
    if not elements or "bounds" not in elements[0]:
        raise RuntimeError("could not read campus bounds from overpass")

    bounds = elements[0]["bounds"]
    name = elements[0].get("tags", {}).get("name", "unknown")
    print(f"  campus: {name}")
    return bounds


def buffered_box(bounds: dict) -> tuple:
    return (
        bounds["minlat"] - BBOX_BUFFER_DEG,
        bounds["minlon"] - BBOX_BUFFER_DEG,
        bounds["maxlat"] + BBOX_BUFFER_DEG,
        bounds["maxlon"] + BBOX_BUFFER_DEG,
    )


def fetch_ways(box: tuple, refresh: bool) -> dict:
    """Walkable ways plus every node they reference."""
    s, w, n, e = box
    query = f"""[out:json][timeout:300];
way["highway"~"^({WALKABLE})$"]["access"!~"^(private|no)$"]({s},{w},{n},{e});
out body;
>;
out skel qt;"""
    return overpass.run("ways", query, refresh)


def fetch_buildings(refresh: bool) -> dict:
    """Buildings inside the campus polygon only.

    Using the polygon and not a box is what keeps Greyhound Terminal
    and the local Walgreens out of the search box.
    """
    query = f"""[out:json][timeout:300];
rel({CAMPUS_RELATION}); map_to_area -> .campus;
(
  way["building"](area.campus);
  relation["building"](area.campus);
);
out tags center;"""
    return overpass.run("buildings", query, refresh)


def fetch_entrances(box: tuple, refresh: bool) -> dict:
    """Entrance nodes. These are the only place wheelchair tags live."""
    s, w, n, e = box
    query = f"""[out:json][timeout:300];
node["entrance"]({s},{w},{n},{e});
out body;"""
    return overpass.run("entrances", query, refresh)


def main() -> int:
    parser = argparse.ArgumentParser(description="pull raw campus data from overpass")
    parser.add_argument("--refresh", action="store_true", help="ignore the cache")
    args = parser.parse_args()

    print("extracting campus data")
    bounds = campus_bounds()
    box = buffered_box(bounds)
    print(f"  query box: {box[0]:.4f},{box[1]:.4f} to {box[2]:.4f},{box[3]:.4f}")

    ways = fetch_ways(box, args.refresh)
    buildings = fetch_buildings(args.refresh)
    entrances = fetch_entrances(box, args.refresh)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "campus_relation": CAMPUS_RELATION,
        "campus_bounds": bounds,
        "query_box": list(box),
        "ways": ways,
        "buildings": buildings,
        "entrances": entrances,
    }
    out = RAW_DIR / "campus_raw.json"
    out.write_text(json.dumps(bundle), encoding="utf-8")

    way_count = sum(1 for e in ways.get("elements", []) if e["type"] == "way")
    node_count = sum(1 for e in ways.get("elements", []) if e["type"] == "node")
    print("")
    print(f"  ways      {way_count}")
    print(f"  nodes     {node_count}")
    print(f"  buildings {len(buildings.get('elements', []))}")
    print(f"  entrances {len(entrances.get('elements', []))}")
    print(f"  wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
