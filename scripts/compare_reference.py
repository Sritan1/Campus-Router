"""Compares our routes with an independent router, looking for patterns not matches."""

import argparse
import statistics
import sys
import time

import httpx

OURS = "http://127.0.0.1:8000"

# osrm with the foot profile. the osrm demo server quietly answers with driving
REFERENCE = "https://routing.openstreetmap.de/routed-foot/route/v1/foot"

# they snap to their nearest way and we go centre to centre, so some gap is expected
TOLERANCE = 0.25

# on a short walk that gap is a big share, so a route must also be this far off in metres
ABSOLUTE_M = 120.0


def interesting(ours: float, theirs: float) -> bool:
    return abs(ours / theirs - 1) > TOLERANCE and abs(ours - theirs) > ABSOLUTE_M


def buildings() -> list:
    reply = httpx.get(f"{OURS}/api/buildings?limit=500", timeout=30)
    reply.raise_for_status()
    return reply.json()["buildings"]


def our_route(start: str, target: str):
    body = {
        "start": start,
        "target": target,
        "mode": "shortest",
        "algorithms": ["astar"],
        "trace": False,
    }
    reply = httpx.post(f"{OURS}/api/route", json=body, timeout=30)
    if reply.status_code != 200:
        return None
    results = reply.json()["results"]
    if not results or results[0]["status"] != "ok":
        return None
    return results[0]["distanceM"]


def their_route(a: dict, b: dict):
    url = f"{REFERENCE}/{a['lon']},{a['lat']};{b['lon']},{b['lat']}?overview=false"
    try:
        reply = httpx.get(url, timeout=30)
        reply.raise_for_status()
        payload = reply.json()
    except (httpx.HTTPError, ValueError):
        return None
    routes = payload.get("routes") or []
    return routes[0]["distance"] if routes else None


def main() -> int:
    parser = argparse.ArgumentParser(description="compare against an outside router")
    parser.add_argument("--pairs", type=int, default=40)
    args = parser.parse_args()

    try:
        named = [b for b in buildings() if b.get("abbr")]
    except httpx.HTTPError as exc:
        print(f"our api is not answering, start the backend first: {exc}", file=sys.stderr)
        return 1

    named.sort(key=lambda b: b["abbr"])
    print(f"{len(named)} buildings with a code, comparing {args.pairs} pairs\n")

    # a stride through the list, so pairs are spread out rather than neighbours
    pairs = []
    step = max(1, len(named) // 7)
    for i in range(len(named)):
        j = (i + step) % len(named)
        if i != j:
            pairs.append((named[i], named[j]))
        if len(pairs) >= args.pairs:
            break

    rows = []
    for a, b in pairs:
        ours = our_route(a["abbr"], b["abbr"])
        theirs = their_route(a, b)
        time.sleep(0.4)

        if ours is None or theirs is None or theirs < 1:
            print(f"  skip {a['abbr']:>5} to {b['abbr']:<5} (no route from one of them)")
            continue

        ratio = ours / theirs
        rows.append((ratio, a["abbr"], b["abbr"], ours, theirs))
        flag = "   <- worth a look" if interesting(ours, theirs) else ""
        print(f"  {a['abbr']:>5} to {b['abbr']:<5} "
              f"ours {ours:7.0f} m   theirs {theirs:7.0f} m   "
              f"ratio {ratio:5.2f}{flag}")

    if not rows:
        print("\nnothing to compare")
        return 1

    ratios = sorted(r[0] for r in rows)
    median = statistics.median(ratios)
    outside = [r for r in rows if interesting(r[3], r[4])]

    print(f"\n=== {len(rows)} pairs compared ===")
    print(f"median ratio {median:.3f}")
    print(f"p10 {ratios[int(len(ratios) * 0.1)]:.3f}   "
          f"p90 {ratios[int(len(ratios) * 0.9)]:.3f}")
    print(f"off by more than {int(TOLERANCE * 100)}% and {ABSOLUTE_M:.0f} m: "
          f"{len(outside)} of {len(rows)}")

    if outside:
        print("\nworth looking at")
        for ratio, a, b, ours, theirs in sorted(outside, key=lambda r: abs(r[0] - 1), reverse=True)[:8]:
            print(f"  {a} to {b}  ours {ours:.0f} m, theirs {theirs:.0f} m, ratio {ratio:.2f}")

    print("\n=== reading this ===")
    if median < 0.9:
        print("we are systematically shorter than an independent router. that")
        print("usually means routing over something people cannot really walk.")
    elif median > 1.15:
        print("we are systematically longer. that usually means connections are")
        print("missing from the graph, so routes detour around gaps that are")
        print("not really there.")
    else:
        print("no systematic bias. the pipeline is putting buildings on the")
        print("network in roughly the right places and the walkable filter is")
        print("not letting anything obviously wrong through.")

    print("\nthey snap to their own nearest way while we run building centre to")
    print("building centre, so exact agreement is not the goal and a spread of")
    print("a few tens of metres is normal.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
