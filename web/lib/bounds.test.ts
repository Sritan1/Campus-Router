import { describe, expect, it } from "vitest";

import type { AlgorithmResult, Building, RouteReply } from "./api";
import { boundsAround, raceBounds } from "./bounds";

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
  route: [number, number][] = [],
): AlgorithmResult {
  return {
    algorithm,
    status: "ok",
    nodesVisited: trace.length,
    edgesRelaxed: 0,
    runtimeUs: 0,
    points: route,
    trace: {
      points: trace,
      edges: trace.slice(1).map((_, i) => [i, i + 1] as [number, number]),
      sampled: false,
      total: trace.length,
      droppedEdges: 0,
    },
  };
}

function reply(results: AlgorithmResult[]): RouteReply {
  return {
    start: building(41.87, -87.65),
    target: building(41.875, -87.652),
    mode: "shortest",
    results,
    directions: null,
    pathGroups: [],
    cost: {
      source: "test",
      notes: [],
      blockedClasses: 0,
      adjustedClasses: 0,
      walkingSpeedMps: 1.607,
      speedDerived: false,
    },
    weather: null,
  };
}

function spread(box: [[number, number], [number, number]]): number {
  return box[1][0] - box[0][0];
}

describe("the box around a set of points", () => {
  it("holds every point it was given", () => {
    const box = boundsAround(
      [
        [41.87, -87.65],
        [41.88, -87.64],
      ],
      0.1,
    )!;
    expect(box[0][0]).toBeLessThan(41.87);
    expect(box[1][0]).toBeGreaterThan(41.88);
    expect(box[0][1]).toBeLessThan(-87.65);
    expect(box[1][1]).toBeGreaterThan(-87.64);
  });

  it("grows by the fraction it was asked for", () => {
    const span = 0.01;
    const box = boundsAround(
      [
        [41.87, -87.65],
        [41.87 + span, -87.65],
      ],
      0.1,
    )!;
    // ten percent of the span on each side, so the box is a fifth wider
    expect(box[1][0] - box[0][0]).toBeCloseTo(span * 1.2, 6);
  });

  it("still gives a usable box for one point", () => {
    // the isochrone is drawn wider than its points, so a floor matters
    const box = boundsAround([[41.87, -87.65]], 0.1)!;
    expect(box[1][0]).toBeGreaterThan(box[0][0]);
    expect(box[1][1]).toBeGreaterThan(box[0][1]);
  });

  it("gives nothing when there are no points", () => {
    expect(boundsAround([], 0.1)).toBeNull();
  });
});

describe("the shared race frame", () => {
  it("always includes both ends", () => {
    const box = raceBounds(reply([]))!;
    expect(box[0][0]).toBeLessThan(41.87);
    expect(box[1][0]).toBeGreaterThan(41.875);
    expect(box[0][1]).toBeLessThan(-87.652);
    expect(box[1][1]).toBeGreaterThan(-87.65);
  });

  it("always includes the whole route", () => {
    const route: [number, number][] = [
      [41.87, -87.65],
      [41.9, -87.62],
    ];
    const box = raceBounds(reply([result("astar", [], route)]))!;
    expect(box[1][0]).toBeGreaterThan(41.9);
    expect(box[1][1]).toBeGreaterThan(-87.62);
  });

  it("covers the bulk of a wide search", () => {
    const wide: [number, number][] = [];
    for (let i = 0; i < 200; i++) {
      wide.push([41.87 + i * 0.00005, -87.65]);
    }
    const box = raceBounds(reply([result("bfs", wide)]))!;
    expect(box[1][0]).toBeGreaterThan(41.878);
  });

  it("does not let a few far strays set the frame", () => {
    const near: [number, number][] = [];
    for (let i = 0; i < 200; i++) {
      near.push([41.871 + (i % 10) * 0.0001, -87.651]);
    }
    const withStrays: [number, number][] = [...near, [42.1, -87.65], [41.6, -87.65]];

    const tight = spread(raceBounds(reply([result("bfs", near)]))!);
    const loose = spread(raceBounds(reply([result("bfs", withStrays)]))!);

    // two strays in two hundred would otherwise leave every panel a speck
    expect(loose).toBeLessThan(tight * 3);
  });

  it("keeps every stray when asked to cover all of it", () => {
    // the single map passes 1, since it has the room
    const near: [number, number][] = [];
    for (let i = 0; i < 200; i++) {
      near.push([41.871 + (i % 10) * 0.0001, -87.651]);
    }
    const withStray: [number, number][] = [...near, [41.95, -87.65]];
    const box = raceBounds(reply([result("bfs", withStray)]), 1)!;

    expect(box[1][0]).toBeGreaterThan(41.95);
  });

  it("leaves a margin so nothing sits on the edge", () => {
    const box = raceBounds(reply([result("astar", [[41.871, -87.651]])]))!;
    expect(box[0][0]).toBeLessThan(41.87);
    expect(box[1][0]).toBeGreaterThan(41.875);
  });

  it("still gives a usable box for two identical points", () => {
    const box = raceBounds({
      ...reply([]),
      start: building(41.87, -87.65),
      target: building(41.87, -87.65),
    })!;
    // a zero sized box would break the map, so the padding has a floor
    expect(box[1][0]).toBeGreaterThan(box[0][0]);
    expect(box[1][1]).toBeGreaterThan(box[0][1]);
  });

  it("gives nothing when there is no reply", () => {
    expect(raceBounds(null)).toBeNull();
  });
});
