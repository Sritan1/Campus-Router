import { describe, expect, it } from "vitest";

import { grow, outlines, simplify, type Ring } from "./isochrone";

function cells(...keys: string[]): Set<string> {
  return new Set(keys);
}

function area(ring: Ring): number {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    total += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(total) / 2;
}

describe("growing the filled squares", () => {
  it("puts a ring around a single square", () => {
    expect(grow(cells("0:0")).size).toBe(9);
  });

  it("joins two squares that were a gap apart", () => {
    // paths either side of a building would otherwise outline as two areas
    const joined = grow(cells("0:0", "2:0"));
    expect(joined.has("1:0")).toBe(true);
  });
});

describe("tracing the outline", () => {
  it("wraps a single square in four corners", () => {
    const rings = outlines(cells("0:0"));
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
    expect(area(rings[0])).toBeCloseTo(1, 5);
  });

  it("wraps a block of squares as one loop", () => {
    const rings = outlines(cells("0:0", "1:0", "0:1", "1:1"));
    expect(rings).toHaveLength(1);
    expect(area(rings[0])).toBeCloseTo(4, 5);
  });

  it("gives separate loops for separate pieces", () => {
    // somewhere across the expressway must not join somewhere you can reach
    const rings = outlines(cells("0:0", "5:5"));
    expect(rings).toHaveLength(2);
  });

  it("follows an L rather than filling it in", () => {
    const rings = outlines(cells("0:0", "1:0", "0:1"));
    expect(rings).toHaveLength(1);
    expect(area(rings[0])).toBeCloseTo(3, 5);
  });

  it("has nothing to trace when nothing was reached", () => {
    expect(outlines(cells())).toHaveLength(0);
  });
});

describe("simplifying into a polygon", () => {
  // a square with pointless extra points along its sides
  function padded(): Ring {
    const ring: Ring = [];
    for (let x = 0; x <= 10; x++) ring.push([x, 0]);
    for (let y = 1; y <= 10; y++) ring.push([10, y]);
    for (let x = 9; x >= 0; x--) ring.push([x, 10]);
    for (let y = 9; y >= 1; y--) ring.push([0, y]);
    return ring;
  }

  it("throws away the points that were not turning", () => {
    const before = padded();
    const after = simplify(before);
    expect(before.length).toBe(40);
    expect(after.length).toBeLessThan(10);
  });

  it("keeps the corners where they were", () => {
    const after = simplify(padded());
    for (const corner of [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]) {
      const found = after.some(
        ([x, y]) =>
          Math.abs(x - corner[0]) < 0.01 && Math.abs(y - corner[1]) < 0.01,
      );
      expect(found).toBe(true);
    }
  });

  it("keeps the area, since a straight side loses nothing", () => {
    const before = padded();
    expect(area(simplify(before))).toBeCloseTo(area(before), 5);
  });

  it("turns a staircase into something with fewer corners", () => {
    // this is what a grid traced outline actually looks like
    const stairs: Ring = [];
    for (let i = 0; i < 8; i++) {
      stairs.push([i, i]);
      stairs.push([i + 1, i]);
    }
    stairs.push([8, 8]);
    stairs.push([0, 8]);

    expect(simplify(stairs, 2).length).toBeLessThan(stairs.length);
  });

  it("leaves a shape alone when it is already only corners", () => {
    const triangle: Ring = [
      [0, 0],
      [4, 0],
      [2, 3],
    ];
    expect(simplify(triangle)).toHaveLength(3);
  });

  it("never hands back something too small to be a shape", () => {
    const tiny: Ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(simplify(tiny, 99).length).toBeGreaterThanOrEqual(3);
  });
});
