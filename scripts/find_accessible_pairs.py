"""Finds pairs where step free routing really changes the answer.

Accessible mode blocks steps and charges more for rough ground. Most of
campus has a step free way round, so on most pairs it changes nothing.
This goes through every pair and says which ones actually differ, so the
readme and the demo can point at a real one instead of a hopeful one.

Talks to the engine directly, not through the gateway, so the public
rate limit does not turn this into a ten minute job.
"""

import itertools

from api.services import cost_model, engine_client
from api.services.graph_data import graph_data


def run(start, target, mode):
    cost = cost_model.build(mode, graph_data.classes, None)
    reply = engine_client.route(
        start.node_id, target.node_id, ["dijkstra"], cost, trace=False
    )
    result = reply["results"][0]
    if result.get("status") != "ok":
        return None
    return result


def main() -> int:
    graph_data.load()
    buildings = graph_data.buildings
    print(f"{len(buildings)} buildings, {len(buildings) * (len(buildings) - 1) // 2} pairs")

    changed = []
    blocked = []
    checked = 0

    for a, b in itertools.combinations(buildings, 2):
        short = run(a, b, "shortest")
        if short is None:
            continue

        step_free = run(a, b, "accessible")
        checked += 1

        if step_free is None:
            blocked.append((a, b, short["distanceM"]))
            continue

        gap = step_free["distanceM"] - short["distanceM"]
        if gap > 1.0:
            changed.append((a, b, short["distanceM"], step_free["distanceM"], gap))

    print(f"pairs where both modes route: {checked}")
    print(f"pairs with no step free route at all: {len(blocked)}")
    print(f"pairs where step free is longer: {len(changed)} "
          f"({100.0 * len(changed) / max(checked, 1):.1f}%)")

    print("\nbiggest detours, longest first")
    changed.sort(key=lambda row: -row[4])
    for a, b, s, f, gap in changed[:20]:
        print(f"  {a.abbr or a.name:8} to {b.abbr or b.name:8} "
              f"{s:7.1f} m -> {f:7.1f} m   plus {gap:6.1f} m "
              f"({100.0 * gap / s:5.1f}%)")

    if blocked:
        print("\nno step free route between these at all")
        for a, b, s in blocked[:20]:
            print(f"  {a.abbr or a.name:8} to {b.abbr or b.name:8} "
                  f"shortest was {s:.1f} m")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
