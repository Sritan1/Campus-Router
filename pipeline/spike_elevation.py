"""Asks whether campus is hilly enough for grade to matter.

Chicago is famously flat, so before building grade aware routing we
should find out whether there is any grade to route around. Same idea
as the tag coverage check, measure first and build second.
"""

import json
import math
import pathlib
import statistics
import sys
import time

import httpx

from pipeline.geo import haversine_m

GRAPH = pathlib.Path(__file__).resolve().parents[1] / "api" / "data" / "graph.json"
CACHE = pathlib.Path(__file__).resolve().parent / ".cache" / "elevation.json"

# free, no key, batched. resolution is coarse but good enough to tell
# flat from not flat.
URL = "https://api.open-meteo.com/v1/elevation"
BATCH = 100

# the numbers that matter for a wheelchair. running slope above 5% needs
# handrails, and 8.33% is the steepest a ramp is allowed to be.
ADA_RUNNING = 5.0
ADA_RAMP = 8.33


def load_graph() -> dict:
    return json.loads(GRAPH.read_text(encoding="utf-8"))


def fetch_elevations(nodes: list) -> dict:
    """One height per node, cached because this is a lot of requests.

    The free service is happy to rate limit us, so this backs off and
    keeps whatever it already has rather than losing the lot.
    """
    if CACHE.exists():
        print("using cached elevations")
        return {int(k): v for k, v in json.loads(CACHE.read_text()).items()}

    heights = {}
    for start in range(0, len(nodes), BATCH):
        chunk = nodes[start : start + BATCH]
        params = {
            "latitude": ",".join(f"{n['lat']:.6f}" for n in chunk),
            "longitude": ",".join(f"{n['lon']:.6f}" for n in chunk),
        }

        payload = None
        for attempt in range(1, 6):
            try:
                reply = httpx.get(URL, params=params, timeout=60)
                if reply.status_code == 429:
                    raise httpx.HTTPError("rate limited")
                reply.raise_for_status()
                payload = reply.json()
                break
            except (httpx.HTTPError, ValueError):
                if attempt == 5:
                    break
                time.sleep(5 * attempt)

        if payload is None:
            print(f"\ngave up after {len(heights)} nodes, working with those")
            break

        for node, height in zip(chunk, payload.get("elevation", [])):
            heights[node["id"]] = height

        print(f"  {min(start + BATCH, len(nodes))} of {len(nodes)}", end="\r")
        time.sleep(1.5)

    print()
    if heights:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(heights), encoding="utf-8")
    return heights


def sample_for(graph: dict, wanted: int) -> list:
    """Nodes belonging to a spread of edges.

    Answering whether campus is flat does not need every node, and both
    ends of a sampled edge are needed for its grade.
    """
    edges = graph["edges"]
    step = max(1, len(edges) // wanted)
    ids = []
    seen = set()
    for edge in edges[::step]:
        for node_id in (edge["u"], edge["v"]):
            if node_id not in seen:
                seen.add(node_id)
                ids.append(node_id)
    return ids


def main() -> int:
    graph = load_graph()
    by_id = {n["id"]: n for n in graph["nodes"]}

    wanted = set(sample_for(graph, 700))
    nodes = [n for n in graph["nodes"] if n["id"] in wanted]

    print(f"sampling {len(nodes)} of {len(graph['nodes'])} nodes")
    heights = fetch_elevations(nodes)
    if not heights:
        return 1

    values = list(heights.values())
    print("\n=== how flat is campus ===")
    print(f"lowest  {min(values):.1f} m")
    print(f"highest {max(values):.1f} m")
    print(f"range   {max(values) - min(values):.1f} m")
    print(f"stdev   {statistics.pstdev(values):.2f} m")

    grades = []
    for edge in graph["edges"]:
        a, b = heights.get(edge["u"]), heights.get(edge["v"])
        if a is None or b is None:
            continue
        run = edge["length_m"]
        if run < 1.0:
            continue
        grades.append((abs(b - a) / run * 100.0, edge))

    if not grades:
        print("no usable edges")
        return 1

    just = sorted(g for g, _ in grades)
    print("\n=== grade across edges ===")
    print(f"median {just[len(just) // 2]:.2f}%")
    print(f"p90    {just[int(len(just) * 0.90)]:.2f}%")
    print(f"p99    {just[int(len(just) * 0.99)]:.2f}%")
    print(f"max    {just[-1]:.2f}%")

    # how coarse the heights are. if they only ever come back as whole
    # metres then a rounding of one metre is the smallest difference we
    # can see at all, and on a short edge that alone looks like a cliff.
    quantum = 1.0 if all(float(v).is_integer() for v in values) else 0.1
    print(f"\nheights are quantised to {quantum} m "
          f"({len(set(values))} distinct values across {len(values)} samples)")

    # only trust an edge long enough that the rounding cannot fake the
    # answer. a metre of rounding over ten metres is already 10%.
    trustworthy_run = quantum / (ADA_RUNNING / 100.0) * 2
    usable = [(g, e) for g, e in grades if e["length_m"] >= trustworthy_run]
    print(f"edges long enough to measure at all (over {trustworthy_run:.0f} m): "
          f"{len(usable)} of {len(grades)}")

    over_running = [e for g, e in usable if g > ADA_RUNNING]
    over_ramp = [e for g, e in usable if g > ADA_RAMP]
    if usable:
        print(f"\nof those, steeper than {ADA_RUNNING}%   {len(over_running)} "
              f"({100.0 * len(over_running) / len(usable):.2f}%)")
        print(f"          steeper than {ADA_RAMP}%  {len(over_ramp)} "
              f"({100.0 * len(over_ramp) / len(usable):.2f}%)")

    print("\nsteepest edges, and how long they are")
    for g, e in sorted(grades, key=lambda x: -x[0])[:8]:
        node = by_id.get(e["u"], {})
        suspect = " <- too short to believe" if e["length_m"] < trustworthy_run else ""
        print(f"  {g:6.1f}%  {e['length_m']:6.1f} m  "
              f"{node.get('lat')},{node.get('lon')}  {e['tags'].get('highway')}{suspect}")

    print("\n=== verdict ===")

    # ignore the few wild samples when asking how hilly campus is
    ranked = sorted(values)
    spread = ranked[int(len(ranked) * 0.99)] - ranked[int(len(ranked) * 0.01)]
    noise_floor = quantum / trustworthy_run * 100.0
    share = 100.0 * len(over_running) / len(usable) if usable else 0.0

    print(f"height across campus, ignoring outliers: {spread:.0f} m")
    print(f"smallest grade this data can see on a {trustworthy_run:.0f} m edge: "
          f"{noise_floor:.1f}%")
    print(f"the threshold we care about: {ADA_RUNNING}%")

    if not usable:
        print("\nnothing here is long enough to measure. the grades above are")
        print("rounding, not terrain.")
    elif ADA_RUNNING < noise_floor * 5:
        print("\nINCONCLUSIVE. the thing we are looking for is not far enough")
        print("above what the data invents on its own, so a reading either way")
        print(f"means little. {share:.1f}% cleared the threshold but that number")
        print("is not trustworthy at this resolution.")
    elif spread < 15:
        print("\ncampus is flat and grade is not a differentiator here.")
    else:
        print(f"\n{share:.1f}% of measurable edges beat the ada running slope,")
        print("with enough margin over the noise to believe it.")

    print("\nnote: this is a coarse global model, and a bare earth one. a")
    print("footbridge reads as the ground underneath it, so anything steep")
    print("here needs checking against the map before it is trusted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
