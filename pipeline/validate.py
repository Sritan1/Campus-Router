"""Checks the built graph and prints a report.

Anything that would make routing quietly wrong is a failure here
rather than a surprise later.
"""

import collections
import json
import pathlib

GRAPH_PATH = pathlib.Path(__file__).resolve().parents[1] / "api" / "data" / "graph.json"

# buildings the prototype uses, so we know search will work
EXPECTED = [
    "Science and Engineering Offices",
    "Lecture Center C",
    "Student Center East",
    "Daley Library",
    "University Hall",
    "Behavioral Sciences Building",
]


def loose(text: str) -> str:
    """Openstreetmap writes both and and ampersand, so treat them the same."""
    return text.lower().replace("&", "and").replace("  ", " ")


def reachable_from(adjacency: dict, start) -> set:
    stack = [start]
    seen = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        for neighbour in adjacency.get(current, ()):
            if neighbour not in seen:
                stack.append(neighbour)
    return seen


def main() -> int:
    if not GRAPH_PATH.exists():
        raise SystemExit("no graph, run python -m pipeline.transform first")

    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in graph["nodes"]}
    edges = graph["edges"]
    buildings = graph["buildings"]

    failures = []
    warnings = []

    print("=== structure ===")
    print(f"nodes     {len(nodes)}")
    print(f"edges     {len(edges)}")
    print(f"buildings {len(buildings)}")
    print(f"classes   {len(graph['classes'])}")

    # every edge has to point at nodes we actually have
    dangling = [e for e in edges if e["u"] not in nodes or e["v"] not in nodes]
    if dangling:
        failures.append(f"{len(dangling)} edges reference missing nodes")

    bad_length = [e for e in edges if e["length_m"] <= 0]
    if bad_length:
        failures.append(f"{len(bad_length)} edges have length <= 0")

    loops = [e for e in edges if e["u"] == e["v"]]
    if loops:
        failures.append(f"{len(loops)} self loop edges")

    orphans = set(nodes) - ({e["u"] for e in edges} | {e["v"] for e in edges})
    if orphans:
        failures.append(f"{len(orphans)} nodes belong to no edge")

    lengths = sorted(e["length_m"] for e in edges)
    total_km = sum(lengths) / 1000
    print(f"total path length {total_km:.1f} km")
    print(f"edge length median {lengths[len(lengths) // 2]:.1f} m, max {lengths[-1]:.1f} m")
    if lengths[-1] > 500:
        warnings.append(f"longest edge is {lengths[-1]:.0f} m, unusually long for a footpath")

    print("\n=== connectivity ===")
    adjacency = collections.defaultdict(list)
    for edge in edges:
        adjacency[edge["u"]].append(edge["v"])
        adjacency[edge["v"]].append(edge["u"])

    reached = reachable_from(adjacency, edges[0]["u"])
    if len(reached) != len(nodes):
        failures.append(f"graph is split, {len(reached)} of {len(nodes)} nodes reachable")
    else:
        print("single connected component, good")

    print("\n=== buildings ===")
    unlinked = [b for b in buildings if not b["links"]]
    if unlinked:
        failures.append(f"{len(unlinked)} buildings have no link into the network")

    via_entrance = sum(1 for b in buildings if b["linked_via_entrance"])
    fallback = [b for b in buildings if b["link_fallback"]]
    print(f"linked through a real entrance {via_entrance} of {len(buildings)}")
    print(f"used the distance fallback     {len(buildings) - via_entrance}")
    if fallback:
        warnings.append(
            f"{len(fallback)} buildings had nothing within the threshold: "
            + ", ".join(b["name"] for b in fallback[:5])
        )

    with_abbr = sum(1 for b in buildings if b["abbr"])
    with_alias = sum(1 for b in buildings if b.get("aliases"))
    print(f"have a building code           {with_abbr}")
    print(f"have extra search aliases      {with_alias}")
    if with_abbr < len(buildings) // 2:
        warnings.append(f"only {with_abbr} of {len(buildings)} buildings have a code")

    duplicates = [n for n, c in collections.Counter(
        b["abbr"] for b in buildings if b["abbr"]).items() if c > 1]
    if duplicates:
        failures.append(f"duplicate building codes, search would be ambiguous: {duplicates}")

    print("\n=== buildings the prototype expects ===")
    names = [b["name"] for b in buildings]
    for wanted in EXPECTED:
        hit = [n for n in names if loose(wanted) in loose(n)]
        mark = "ok " if hit else "MISSING"
        print(f"  {mark} {wanted}" + (f"  -> {hit[0]}" if hit else ""))
        if not hit:
            warnings.append(f"prototype building not found: {wanted}")

    print("\n=== edge classes ===")
    for entry in sorted(graph["classes"], key=lambda c: -c["edge_count"])[:12]:
        print(f"  {entry['class_key']:<40} {entry['edge_count']}")

    print("\n=== accessible mode viability ===")
    steps = [e for e in edges if e["tags"].get("highway") == "steps"]
    print(f"step edges {len(steps)}")
    if not steps:
        failures.append("no step edges, accessible mode would be identical to shortest")

    # blocking steps must not cut the network into pieces
    step_pairs = {(e["u"], e["v"]) for e in steps}
    step_free = collections.defaultdict(list)
    for edge in edges:
        if (edge["u"], edge["v"]) in step_pairs:
            continue
        step_free[edge["u"]].append(edge["v"])
        step_free[edge["v"]].append(edge["u"])

    reached_free = reachable_from(step_free, edges[0]["u"])
    stranded = len(nodes) - len(reached_free)
    print(f"nodes unreachable once steps are blocked: {stranded}")
    if stranded:
        warnings.append(
            f"blocking steps strands {stranded} nodes, accessible mode needs a no path state"
        )

    surface_known = sum(1 for e in edges if e["tags"].get("surface"))
    pct = 100.0 * surface_known / len(edges)
    print(f"\nedges with a surface tag {surface_known} of {len(edges)} ({pct:.1f}%)")

    print("\n=== result ===")
    for warning in warnings:
        print(f"  WARN {warning}")
    for failure in failures:
        print(f"  FAIL {failure}")
    if not failures:
        print("  all checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
