import { describe, expect, it } from "vitest";

import type { AlgorithmResult, Building, RouteReply } from "./api";
import { raceBounds } from "./bounds";

function building(lat: number, lon: number): Building {
  return {
    id: "1",
    nodeId: -1,
    name: "Somewhere",
    abbr: null,
    aliases: [],
    wheelchair: null,
    lat,
    lon,
  };
}

function result(
  algorithm: AlgorithmResult["algorithm"],
  trace: [number, number][],
): AlgorithmResult {
  return {
    algorithm,
    status: "ok",
    nodesVisited: trace.length,
    edgesRelaxed: 0,
    runtimeUs: 0,
    points: [trace[0], trace[trace.length - 1]],
    trace: {
      points: trace,
      edges: trace.slice(1).map((_, i) => [i, i + 1] as [number, number]),
      sampled: false,
      total: trace.length,
    },
  };
}

function reply(results: AlgorithmResult[]): RouteReply {
  return {
    start: building(41.87, -87.65),
    target: building(41.875, -87.652),
    mode: "shortest",
    results,
    pathGroups: [],
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

describe("the shared race frame", () => {
  it("covers the widest search, not just the route", () => {
    // bfs spreads well past the direct line, and clipping it would hide
    // exactly the thing the comparison is meant to show
    const narrow = result("astar", [
      [41.871, -87.651],
      [41.872, -87.651],
    ]);
    const wide = result("bfs", [
      [41.86, -87.66],
      [41.885, -87.64],
    ]);

    const box = raceBounds(reply([narrow, wide]));
    expect(box).not.toBeNull();
    const [[minLat, minLon], [maxLat, maxLon]] = box!;

    expect(minLat).toBeLessThan(41.86);
    expect(maxLat).toBeGreaterThan(41.885);
    expect(minLon).toBeLessThan(-87.66);
    expect(maxLon).toBeGreaterThan(-87.64);
  });

  it("always includes both ends", () => {
    // even when nothing found a route there is still a start and a target
    const box = raceBounds(reply([]));
    expect(box).not.toBeNull();
    const [[minLat, minLon], [maxLat, maxLon]] = box!;

    expect(minLat).toBeLessThan(41.87);
    expect(maxLat).toBeGreaterThan(41.875);
    expect(minLon).toBeLessThan(-87.652);
    expect(maxLon).toBeGreaterThan(-87.65);
  });

  it("leaves a margin so nothing sits on the edge", () => {
    const one = result("astar", [
      [41.87, -87.65],
      [41.871, -87.651],
    ]);
    const [[minLat], [maxLat]] = raceBounds(reply([one]))!;
    expect(minLat).toBeLessThan(41.87);
    expect(maxLat).toBeGreaterThan(41.875);
  });

  it("still gives a usable box for two identical points", () => {
    const box = raceBounds({
      ...reply([]),
      start: building(41.87, -87.65),
      target: building(41.87, -87.65),
    })!;
    const [[minLat, minLon], [maxLat, maxLon]] = box;
    // a zero sized box would break the map, so the padding has a floor
    expect(maxLat).toBeGreaterThan(minLat);
    expect(maxLon).toBeGreaterThan(minLon);
  });

  it("gives nothing when there is no reply", () => {
    expect(raceBounds(null)).toBeNull();
  });
});
