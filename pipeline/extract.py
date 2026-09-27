"""Pulls raw campus data from Overpass."""

import argparse
import datetime as dt
import json
import pathlib

from pipeline import overpass
from pipeline.transform import WALKABLE

# east campus, then west, the health sciences half
CAMPUS_RELATIONS = [19755400, 17687555]

# uic buildings in neither relation, since south campus has none of its own
EXTRA_BUILDINGS = [
    ("relation", 17650163),   # Thomas Beckham Hall, TBH
    ("relation", 17650162),   # Marie Robinson Hall, MRH
    ("way", 149877814),       # Taylor Street Building, TSB
    ("way", 210257610),       # 1253 South Halsted
    ("way", 930816391),       # Maxwell Street Parking Structure
]

# way 210257184 is a codeless second piece of the Taylor Street Building,
# left out so search does not show the name twice

# the school of law is downtown, and would drag the loop in for one building

# about 110 metres of slack, so sidewalks just off the edge still connect
BBOX_BUFFER_DEG = 0.001

# taken from transform, so the download and the build never disagree
WALKABLE_PATTERN = "|".join(sorted(WALKABLE))

RAW_DIR = pathlib.Path(__file__).resolve().parent / "raw"


def campus_bounds() -> dict:
    # the box covers both campuses, so the corridor between them comes along
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
    s, w, n, e = box
    query = f"""[out:json][timeout:300];
way["highway"~"^({WALKABLE_PATTERN})$"]["access"!~"^(private|no)$"]({s},{w},{n},{e});
out body;
>;
out skel qt;"""
    return overpass.run("ways", query, refresh)


def fetch_buildings(refresh: bool) -> dict:
    # polygons, not a box, keep Greyhound Terminal and the local Walgreens out of search
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
    # entrances are the only place wheelchair tags live
    s, w, n, e = box
    query = f"""[out:json][timeout:300];
node["entrance"]({s},{w},{n},{e});
out body;"""
    return overpass.run("entrances", query, refresh)


def data_date(*payloads: dict) -> str:
    # the cache can be weeks old
    stamps = []
    for payload in payloads:
        stamp = payload.get("osm3s", {}).get("timestamp_osm_base", "")
        if stamp:
            stamps.append(stamp[:10])
    return min(stamps) if stamps else dt.date.today().isoformat()


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
        # the about page shows this date, so record it rather than remember it
        "fetched": data_date(ways, buildings, entrances),
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
