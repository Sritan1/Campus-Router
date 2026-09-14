"""Pulls raw campus data from Overpass.

Paths come from a slightly buffered box around campus so that sidewalks
just off the edge still connect. Buildings come from the campus polygon
itself so search does not fill up with nearby businesses.
"""

import argparse
import datetime as dt
import json
import pathlib

from pipeline import overpass
from pipeline.transform import WALKABLE

# east campus and west campus, as mapped in openstreetmap. west is the
# health sciences half and it was missing entirely until round 18.
CAMPUS_RELATIONS = [19755400, 17687555]

# uic buildings that sit in neither campus relation. south campus has no
# relation of its own, so without these they are simply lost.
EXTRA_BUILDINGS = [
    ("relation", 17650163),   # Thomas Beckham Hall, TBH
    ("relation", 17650162),   # Marie Robinson Hall, MRH
    ("way", 149877814),       # Taylor Street Building, TSB
    ("way", 210257610),       # 1253 South Halsted
    ("way", 930816391),       # Maxwell Street Parking Structure
]

# way 210257184 is a second piece of the Taylor Street Building with no
# code. adding it would put two identical names in the search box, which
# is worse than leaving it out.

# the school of law is uic too but sits downtown, about 1.2 km further
# east. pulling it in would drag the whole loop along for one building.

# roughly 110 metres of slack around the campus edge
BBOX_BUFFER_DEG = 0.001

# the same list transform keeps, turned into what overpass wants. these
# used to be written out twice, and adding a value to one of them alone
# either downloads ways nothing reads or reads ways nothing downloaded.
WALKABLE_PATTERN = "|".join(sorted(WALKABLE))

RAW_DIR = pathlib.Path(__file__).resolve().parent / "raw"


def campus_bounds() -> dict:
    """Asks openstreetmap where campus actually is instead of guessing.

    Two relations now, east and west, so the box is the union of both
    and the corridor between them comes along with it.
    """
    parts = ";".join(f"rel({r})" for r in CAMPUS_RELATIONS)
    query = f"""[out:json][timeout:120];
({parts};);
out tags bb;"""
    payload = overpass.run("campus_bounds", query)

    found = [e for e in payload.get("elements", []) if "bounds" in e]
    if len(found) != len(CAMPUS_RELATIONS):
        raise RuntimeError(
            f"wanted bounds for {len(CAMPUS_RELATIONS)} campus relations, got {len(found)}"
        )

    for element in found:
        print(f"  campus: {element.get('tags', {}).get('name', 'unknown')}")

    return {
        "minlat": min(e["bounds"]["minlat"] for e in found),
        "minlon": min(e["bounds"]["minlon"] for e in found),
        "maxlat": max(e["bounds"]["maxlat"] for e in found),
        "maxlon": max(e["bounds"]["maxlon"] for e in found),
    }


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
way["highway"~"^({WALKABLE_PATTERN})$"]["access"!~"^(private|no)$"]({s},{w},{n},{e});
out body;
>;
out skel qt;"""
    return overpass.run("ways", query, refresh)


def fetch_buildings(refresh: bool) -> dict:
    """Buildings inside either campus polygon, plus the named strays.

    Using polygons and not a box is what keeps Greyhound Terminal and
    the local Walgreens out of the search box.
    """
    areas = "\n".join(
        f"  rel({rel}); map_to_area -> .a{i};"
        for i, rel in enumerate(CAMPUS_RELATIONS)
    )
    inside = "\n".join(
        f'  way["building"](area.a{i});\n  relation["building"](area.a{i});'
        for i, _ in enumerate(CAMPUS_RELATIONS)
    )
    strays = "\n".join(f"  {kind}({osm_id});" for kind, osm_id in EXTRA_BUILDINGS)

    query = f"""[out:json][timeout:300];
(
{areas}
);
(
{inside}
{strays}
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
        "campus_relations": CAMPUS_RELATIONS,
        "campus_bounds": bounds,
        "query_box": list(box),
        # the day the data came out of openstreetmap. the app says this on
        # its about page, so it has to be recorded rather than remembered.
        "fetched": dt.date.today().isoformat(),
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
