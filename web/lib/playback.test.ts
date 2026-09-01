import { describe, expect, it } from "vitest";

import type { AlgorithmResult } from "./api";
import { barFraction, clamp, pointsShown } from "./playback";

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

describe("points shown", () => {
  it("shows nothing at the start and everything at the end", () => {
    const one = result("astar", 100, 200);
    expect(pointsShown(one, 0)).toBe(1);
    expect(pointsShown(one, 1)).toBe(200);
  });

  it("moves through the trace as it plays", () => {
    const one = result("astar", 100, 200);
    expect(pointsShown(one, 0.5)).toBe(100);
  });

  it("handles an algorithm with no trace", () => {
    const bare = { ...result("bfs", 10, 0) };
    delete bare.trace;
    expect(pointsShown(bare, 0.5)).toBe(0);
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
