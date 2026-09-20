"""Turns the raw Overpass dump into the graph files the gateway and engine load."""

import argparse
import collections
import datetime as dt
import json
import pathlib

from pipeline.geo import haversine_m

RAW_PATH = pathlib.Path(__file__).resolve().parent / "raw" / "campus_raw.json"
PATCH_PATH = pathlib.Path(__file__).resolve().parent / "patches.json"
OUT_PATH = pathlib.Path(__file__).resolve().parents[1] / "api" / "data" / "graph.json"
ENGINE_PATH = pathlib.Path(__file__).resolve().parents[1] / "api" / "data" / "graph.campus"

# patched edges come from no real way, so they get their own marker
PATCH_WAY_ID = -1

# building nodes go negative, since osm way ids and node ids can collide
LINK_CLASS = "link|building|none"

SCHEMA_VERSION = 1

# service covers campus driveways and parking aisles, which people really walk
WALKABLE = {
    "footway",
    "path",
    "steps",
    "pedestrian",
    "corridor",
    "living_street",
    "service",
    "residential",
}

BUILDING_LINK_M = 60.0

KEPT_TAGS = [
    "highway", "surface", "wheelchair", "incline", "lit", "covered",
    "tactile_paving", "footway", "name",
]

# a crossing borrows the name of the road it meets, since crossings rarely have one
NAMED_ROADS = {
    "residential", "living_street", "service", "unclassified",
    "tertiary", "secondary", "primary",
}


def raw_written_on() -> str:
    # for dumps pulled before extract stamped a date
    stamp = RAW_PATH.stat().st_mtime
    return dt.date.fromtimestamp(stamp).isoformat()


def load_raw() -> dict:
    if not RAW_PATH.exists():
        raise SystemExit("no raw data, run python -m pipeline.extract first")
    return json.loads(RAW_PATH.read_text(encoding="utf-8"))


def normalise_surface(value):
    if not value:
        return "unknown"
    value = value.strip().lower()
    # subtypes like concrete plates collapse to the parent
    return value.split(":")[0]


def class_key(tags: dict) -> str:
    # wheelchair, incline, lit and covered are too sparse on campus to key on
    highway = tags.get("highway") or "unknown"
    surface = normalise_surface(tags.get("surface"))
    tactile = "tactile" if tags.get("tactile_paving") in ("yes", "contrasted") else "none"
    return f"{highway}|{surface}|{tactile}"


def build_nodes(raw: dict) -> dict:
    nodes = {}
    for element in raw["ways"]["elements"]:
        if element["type"] == "node":
            nodes[element["id"]] = (element["lat"], element["lon"])

    # some entrances sit on no way at all, which is exactly what a patch needs to reach
    for element in raw["entrances"]["elements"]:
        if "lat" in element and "lon" in element:
            nodes.setdefault(element["id"], (element["lat"], element["lon"]))
    return nodes


def load_patches() -> list:
    # paths osm has not mapped yet, each joining two nodes the dump already has
    if not PATCH_PATH.exists():
        return []
    return json.loads(PATCH_PATH.read_text(encoding="utf-8"))["ways"]


def apply_patches(edges: list, nodes: dict, patches: list) -> int:
    seen = {(edge["u"], edge["v"]) for edge in edges}
    added = 0

    for patch in patches:
        u, v = patch["u"], patch["v"]
        if u not in nodes or v not in nodes:
            raise SystemExit(f"patch names node {u} or {v} which the dump does not have")

        pair = (u, v) if u < v else (v, u)
        if pair in seen:
            # openstreetmap has caught up, the patch is no longer needed
            continue

        length = haversine_m(*nodes[u], *nodes[v])
        if length <= 0:
            continue

        edges.append(
            {
                "id": len(edges),
                "u": pair[0],
                "v": pair[1],
                "way_id": PATCH_WAY_ID,
                "length_m": round(length, 3),
                "tags": dict(patch["tags"]),
                "class_key": class_key(patch["tags"]),
            }
        )
        seen.add(pair)
        added += 1

    return added


def road_names_by_node(raw: dict) -> dict:
    # only nodes on exactly one named road, since two names means an intersection
    found = {}
    for element in raw["ways"]["elements"]:
        if element["type"] != "way":
            continue
        tags = element.get("tags", {})
        name = tags.get("name")
        if not name or tags.get("highway") not in NAMED_ROADS:
            continue
        for node_id in element.get("nodes", []):
            found.setdefault(node_id, set()).add(name)

    return {node: next(iter(names)) for node, names in found.items() if len(names) == 1}


def crossing_name(element: dict, road_names: dict):
    hits = {road_names[n] for n in element.get("nodes", []) if n in road_names}
    return hits.pop() if len(hits) == 1 else None


def build_edges(raw: dict, nodes: dict) -> list:
    # one edge per consecutive node pair, so each edge carries its own tags
    edges = []
    seen = {}
    contested = []
    road_names = road_names_by_node(raw)

    for element in raw["ways"]["elements"]:
        if element["type"] != "way":
            continue
        tags = element.get("tags", {})
        if tags.get("highway") not in WALKABLE:
            continue

        refs = element.get("nodes", [])
        # only tags that are set, writing out the empty ones doubled the file
        kept = {t: tags[t] for t in KEPT_TAGS if tags.get(t)}
        key = class_key(tags)

        if tags.get("footway") == "crossing":
            crosses = crossing_name(element, road_names)
            if crosses:
                kept["crosses"] = crosses

        for u, v in zip(refs, refs[1:]):
            if u == v or u not in nodes or v not in nodes:
                continue

            # overlapping ways repeat pairs and the first listed wins. a dropped steps
            # claim would quietly unblock a staircase, so report class conflicts
            pair = (u, v) if u < v else (v, u)
            if pair in seen:
                if seen[pair] != key:
                    contested.append((pair, seen[pair], key))
                continue
            seen[pair] = key

            length = haversine_m(*nodes[u], *nodes[v])
            if length <= 0:
                continue

            edges.append(
                {
                    "id": len(edges),
                    "u": pair[0],
                    "v": pair[1],
                    "way_id": element["id"],
                    "length_m": round(length, 3),
                    "tags": kept,
                    "class_key": key,
                }
            )

    if contested:
        print(f"segments claimed by two classes: {len(contested)}, kept the first")
        for pair, kept, dropped in contested[:5]:
            print(f"  {pair[0]} to {pair[1]}: kept {kept}, dropped {dropped}")

    return edges


def largest_component(edges: list) -> set:
    # stray disconnected paths only ever produce routes that fail
    adjacency = collections.defaultdict(list)
    for edge in edges:
        adjacency[edge["u"]].append(edge["v"])
        adjacency[edge["v"]].append(edge["u"])

    unvisited = set(adjacency)
    best = set()

    while unvisited:
        start = next(iter(unvisited))
        stack = [start]
        seen = set()
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            for neighbour in adjacency[current]:
                if neighbour not in seen:
                    stack.append(neighbour)
        unvisited -= seen
        if len(seen) > len(best):
            best = seen

    return best


def pick_refs(tags: dict):
    # codes live in ref and some list several. the first is the code, the rest are aliases
    raw = tags.get("ref") or tags.get("short_name") or tags.get("abbr")
    parts = []
    if raw:
        parts = [p.strip() for p in raw.split(";") if p.strip()]

    aliases = parts[1:]
    for key in ("alt_name", "old_name", "loc_name"):
        if tags.get(key):
            aliases.extend(p.strip() for p in tags[key].split(";") if p.strip())

    return (parts[0] if parts else None), aliases


def step_free_component(edges: list) -> set:
    return largest_component(
        [e for e in edges if e["class_key"].split("|")[0] != "steps"]
    )


def build_buildings(
    raw: dict,
    nodes: dict,
    network: set,
    entrance_ids: set,
    step_free: set | None = None,
) -> list:
    # real entrances win, otherwise the closest nodes. if every pick sits behind
    # steps, the nearest step free node is added too
    buildings = []

    candidates = [(nid, nodes[nid]) for nid in network if nid in nodes]

    for element in raw["buildings"]["elements"]:
        tags = element.get("tags", {})
        name = tags.get("name")
        if not name:
            continue

        centre = element.get("center")
        if not centre:
            continue
        clat, clon = centre["lat"], centre["lon"]

        near = []
        for nid, (nlat, nlon) in candidates:
            distance = haversine_m(clat, clon, nlat, nlon)
            if distance <= BUILDING_LINK_M:
                near.append((distance, nid))
        near.sort()

        # prefer entrances, they are the honest way into a building
        entrances_near = [(d, n) for d, n in near if n in entrance_ids]
        chosen = entrances_near[:4] if entrances_near else near[:3]

        fallback_used = False
        if not chosen:
            everything = sorted(
                (haversine_m(clat, clon, nlat, nlon), nid) for nid, (nlat, nlon) in candidates
            )
            chosen = everything[:1]
            fallback_used = True

        step_free_used = False
        if step_free and not any(nid in step_free for _, nid in chosen):
            reachable = [(d, nid) for d, nid in near if nid in step_free]
            if not reachable:
                reachable = sorted(
                    (haversine_m(clat, clon, nlat, nlon), nid)
                    for nid, (nlat, nlon) in candidates
                    if nid in step_free
                )
            if reachable:
                chosen = list(chosen) + reachable[:1]
                step_free_used = True

        abbr, aliases = pick_refs(tags)
        buildings.append(
            {
                "id": str(element["id"]),
                "osm_type": element["type"],
                "name": name,
                "abbr": abbr,
                "aliases": aliases,
                "wheelchair": tags.get("wheelchair"),
                "centroid": {"lat": clat, "lon": clon},
                "links": [
                    {"node_id": nid, "distance_m": round(d, 3)} for d, nid in chosen
                ],
                "linked_via_entrance": bool(entrances_near),
                "link_fallback": fallback_used,
                "step_free_fallback": step_free_used,
            }
        )

    return buildings


def write_engine_graph(nodes: dict, used: set, edges: list, buildings: list) -> None:
    # plain text, so the engine needs no json library, and a quarter the size
    class_ids = {}
    for edge in edges:
        if edge["class_key"] not in class_ids:
            class_ids[edge["class_key"]] = len(class_ids)
    class_ids.setdefault(LINK_CLASS, len(class_ids))

    lines = ["campus-graph 1"]

    lines.append(f"classes {len(class_ids)}")
    for key, index in sorted(class_ids.items(), key=lambda kv: kv[1]):
        lines.append(f"{index} {key}")

    lines.append(f"nodes {len(used) + len(buildings)}")
    for nid in sorted(used):
        lat, lon = nodes[nid]
        lines.append(f"{nid} {lat:.7f} {lon:.7f}")
    for building in buildings:
        centre = building["centroid"]
        lines.append(f"-{building['id']} {centre['lat']:.7f} {centre['lon']:.7f}")

    link_count = sum(len(b["links"]) for b in buildings)
    lines.append(f"edges {len(edges) + link_count}")
    for edge in edges:
        lines.append(
            f"{edge['u']} {edge['v']} {edge['length_m']:.3f} {class_ids[edge['class_key']]}"
        )
    for building in buildings:
        for link in building["links"]:
            lines.append(
                f"-{building['id']} {link['node_id']} {link['distance_m']:.3f}"
                f" {class_ids[LINK_CLASS]}"
            )

    ENGINE_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    size_mb = ENGINE_PATH.stat().st_size / 1024 / 1024
    print(f"wrote {ENGINE_PATH} ({size_mb:.2f} MB)")


def main() -> int:
    parser = argparse.ArgumentParser(description="build the campus graph")
    parser.add_argument("--keep-all", action="store_true",
                        help="keep disconnected pieces instead of the largest component")
    args = parser.parse_args()

    raw = load_raw()
    nodes = build_nodes(raw)
    edges = build_edges(raw, nodes)
    patched = apply_patches(edges, nodes, load_patches())
    print(f"nodes from overpass : {len(nodes)}")
    print(f"edges built         : {len(edges)}")
    if patched:
        print(f"local patches       : {patched} added, see pipeline/patches.json")

    component = largest_component(edges)
    if not args.keep_all:
        before = len(edges)
        edges = [e for e in edges if e["u"] in component and e["v"] in component]
        print(f"largest component   : {len(component)} nodes, dropped {before - len(edges)} edges")

    used = {e["u"] for e in edges} | {e["v"] for e in edges}
    entrance_ids = {e["id"] for e in raw["entrances"]["elements"]}
    step_free = step_free_component(edges)
    buildings = build_buildings(raw, nodes, used, entrance_ids, step_free)
    rescued = [b["name"] for b in buildings if b["step_free_fallback"]]
    print(f"buildings named     : {len(buildings)}")
    if rescued:
        print(f"step free rescues   : {len(rescued)} ({', '.join(rescued)})")

    classes = collections.Counter(e["class_key"] for e in edges)

    graph = {
        "schema_version": SCHEMA_VERSION,
        "meta": {
            "campus_relations": raw["campus_relations"],
            "campus_bounds": raw["campus_bounds"],
            "query_box": raw["query_box"],
            # older dumps fall back to the day the file was written
            "extracted": raw.get("fetched") or raw_written_on(),
            "counts": {
                "nodes": len(used),
                "edges": len(edges),
                "buildings": len(buildings),
                "classes": len(classes),
            },
        },
        "nodes": [
            {"id": nid, "lat": nodes[nid][0], "lon": nodes[nid][1]} for nid in sorted(used)
        ],
        "edges": edges,
        "buildings": sorted(buildings, key=lambda b: b["name"]),
        "classes": [
            {"class_key": k, "edge_count": v} for k, v in sorted(classes.items())
        ],
    }

    # compact, nobody reads this by hand
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    size_mb = OUT_PATH.stat().st_size / 1024 / 1024
    print(f"classes             : {len(classes)}")
    print(f"wrote {OUT_PATH} ({size_mb:.2f} MB)")

    write_engine_graph(nodes, used, edges, graph["buildings"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
