import { describe, expect, it } from "vitest";

import type { AlgorithmName, AlgorithmResult, RouteReply } from "./api";
import { agreementFor } from "./agreement";

function result(algorithm: AlgorithmName, ok = true): AlgorithmResult {
  return {
    algorithm,
    status: ok ? "ok" : "no_path",
    distanceM: 800,
    estSeconds: 500,
    nodesVisited: 100,
    edgesRelaxed: 100,
    runtimeUs: 100,
  };
}

function reply(
  results: AlgorithmResult[],
  groups: AlgorithmName[][],
): RouteReply {
  return {
    start: {} as never,
    target: {} as never,
    mode: "shortest",
    results,
    directions: null,
    pathGroups: groups.map((algorithms) => ({ algorithms })),
    cost: {
      source: "test",
      notes: [],
      blockedClasses: 0,
      adjustedClasses: 0,
      walkingSpeedMps: 1.607,
    },
    weather: null,
  };
}

const FOUR: AlgorithmResult[] = [
  result("dijkstra"),
  result("astar"),
  result("bfs"),
  result("bidirectional"),
];

describe("what the invite is allowed to claim", () => {
  it("says everyone agreed when there is one path", () => {
    const found = agreementFor(
      reply(FOUR, [["dijkstra", "astar", "bfs", "bidirectional"]]),
    );
    expect(found?.headline).toBe("All 4 algorithms agree on this route");
  });

  it("names the odd one out when exactly one differs", () => {
    // this is the interesting case and it happens often, because bfs
    // optimises hops rather than distance
    const found = agreementFor(
      reply(FOUR, [["dijkstra", "astar", "bidirectional"], ["bfs"]]),
    );
    expect(found?.headline).toBe("3 of 4 agree. BFS found a different route");
    expect(found?.invite).toBe("Compare them");
  });

  it("counts the routes when several differ", () => {
    const found = agreementFor(
      reply(FOUR, [["dijkstra", "astar"], ["bfs"], ["bidirectional"]]),
    );
    expect(found?.headline).toBe("These 4 algorithms found 3 different routes");
  });

  it("says nothing at all when nothing found a route", () => {
    // no claim is better than a wrong one
    const none = FOUR.map((r) => ({ ...r, status: "no_path" as const }));
    expect(agreementFor(reply(none, []))).toBeNull();
  });

  it("counts only the algorithms that actually finished", () => {
    const mixed = [result("dijkstra"), result("astar"), result("bfs", false)];
    const found = agreementFor(reply(mixed, [["dijkstra", "astar"]]));
    expect(found?.headline).toBe("All 2 algorithms agree on this route");
  });

  it("handles a single algorithm without claiming agreement between many", () => {
    const found = agreementFor(reply([result("astar")], [["astar"]]));
    expect(found?.headline).toBe("All 1 algorithms agree on this route");
  });
});
