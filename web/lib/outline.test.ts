import { describe, expect, it } from "vitest";

import { grow, outlines, smooth, type Ring } from "./isochrone";

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
    // this is the point of it. paths either side of a building would
    // otherwise outline as two separate areas.
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
    // somewhere across the expressway you genuinely cannot reach should
    // not be joined to somewhere you can
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

describe("rounding the corners", () => {
  const square: Ring = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ];

  it("adds points instead of moving the shape somewhere else", () => {
    const rounded = smooth(square);
    expect(rounded.length).toBeGreaterThan(square.length);
    // cutting corners always loses a little area, never gains
    expect(area(rounded)).toBeLessThan(area(square));
    expect(area(rounded)).toBeGreaterThan(area(square) * 0.7);
  });

  it("stays inside the original", () => {
    for (const [x, y] of smooth(square)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(2);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(2);
    }
  });
});
