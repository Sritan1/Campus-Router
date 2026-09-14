import { describe, expect, it } from "vitest";

import type { AlgorithmResult } from "./api";
import { barFraction, clamp, edgesShown } from "./playback";

function result(
  algorithm: string,
  nodesVisited: number,
  tracePoints: number,
  runtimeUs = 0,
): AlgorithmResult {
  return {
    algorithm: algorithm as AlgorithmResult["algorithm"],
    status: "ok",
    nodesVisited,
    edgesRelaxed: 0,
    runtimeUs,
    trace: {
      points: Array.from({ length: tracePoints }, () => [0, 0] as [number, number]),
      edges: Array.from({ length: Math.max(0, tracePoints - 1) }, (_, i) => [i, i + 1] as [number, number]),
      sampled: false,
      total: tracePoints,
      droppedEdges: 0,
    },
  };
}

describe("clamp", () => {
  it("keeps progress between nothing and everything", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.5)).toBe(0.5);
    expect(clamp(2)).toBe(1);
  });
});

describe("how much of the search is drawn", () => {
  it("draws nothing at the start and all of it at the end", () => {
    // 200 points joined in a chain makes 199 paths between them
    const one = result("astar", 100, 200);
    expect(edgesShown(one, 0)).toBe(0);
    expect(edgesShown(one, 1)).toBe(199);
  });

  it("moves through the search as it plays", () => {
    const one = result("astar", 100, 200);
    expect(edgesShown(one, 0.5)).toBe(100);
  });

  it("handles an algorithm with no trace", () => {
    const bare = { ...result("bfs", 10, 0) };
    delete bare.trace;
    expect(edgesShown(bare, 0.5)).toBe(0);
  });

  it("never runs past the end", () => {
    const one = result("astar", 100, 200);
    expect(edgesShown(one, 3)).toBe(199);
  });
});

describe("bars", () => {
  // runtimes from a real cross campus race, where bfs settles the most
  // nodes of anyone and still finishes first
  const all = [
    result("dijkstra", 12898, 200, 2521),
    result("astar", 3183, 185, 1156),
    result("bfs", 13316, 200, 764),
  ];

  it("the slowest algorithm fills the whole bar", () => {
    expect(barFraction(all[0], all, 1)).toBe(1);
  });

  it("a quicker run gets a shorter bar", () => {
    expect(barFraction(all[1], all, 1)).toBeCloseTo(1156 / 2521, 5);
  });

  it("measures time and not work, so the busiest search can be shortest", () => {
    // bfs settles more nodes than dijkstra and still gets the shorter
    // bar. keying on nodes hid exactly this.
    expect(all[2].nodesVisited).toBeGreaterThan(all[0].nodesVisited);
    expect(barFraction(all[2], all, 1)).toBeLessThan(barFraction(all[0], all, 1));
  });

  it("everything starts empty and grows on one shared clock", () => {
    for (const one of all) {
      expect(barFraction(one, all, 0)).toBe(0);
    }
    expect(barFraction(all[0], all, 0.5)).toBeCloseTo(0.5, 5);
  });

  it("never overflows the track", () => {
    for (const one of all) {
      expect(barFraction(one, all, 5)).toBeLessThanOrEqual(1);
    }
  });

  it("does not divide by zero when nothing was measured", () => {
    const zero = [result("dijkstra", 10, 5), result("astar", 5, 5)];
    expect(barFraction(zero[0], zero, 1)).toBe(0);
  });
});
