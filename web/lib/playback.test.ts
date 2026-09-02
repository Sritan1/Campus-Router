import { describe, expect, it } from "vitest";

import type { AlgorithmResult } from "./api";
import { barFraction, clamp, edgesShown } from "./playback";

function result(
  algorithm: string,
  nodesVisited: number,
  tracePoints: number,
): AlgorithmResult {
  return {
    algorithm: algorithm as AlgorithmResult["algorithm"],
    status: "ok",
    nodesVisited,
    edgesRelaxed: 0,
    runtimeUs: 0,
    trace: {
      points: Array.from({ length: tracePoints }, () => [0, 0] as [number, number]),
      edges: Array.from({ length: Math.max(0, tracePoints - 1) }, (_, i) => [i, i + 1] as [number, number]),
      sampled: false,
      total: tracePoints,
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
  const all = [
    result("dijkstra", 852, 200),
    result("astar", 185, 185),
    result("bfs", 421, 200),
  ];

  it("the busiest algorithm fills the whole bar", () => {
    expect(barFraction(all[0], all, 1)).toBe(1);
  });

  it("a lighter search gets a shorter bar", () => {
    // this is the whole point of the panel, a star doing less work
    expect(barFraction(all[1], all, 1)).toBeCloseTo(185 / 852, 5);
    expect(barFraction(all[1], all, 1)).toBeLessThan(barFraction(all[2], all, 1));
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
});
