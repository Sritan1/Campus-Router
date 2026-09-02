// Working out the shape of everywhere you can walk to.

/// One area, one colour. Splitting the budget into sub bands implied a
/// precision the walking speed does not have, and gave the eye three
/// outlines to read when one is the answer.
export const REGION_COLOUR = "#2a78d6";

export type Ring = [number, number][];

/// Grows the filled squares by one, to close the gaps between paths
/// that run alongside each other so they read as one area.
export function grow(cells: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const key of cells) {
    const [x, y] = key.split(":").map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        out.add(`${x + dx}:${y + dy}`);
      }
    }
  }
  return out;
}

/// Traces the outline around a set of filled squares.
///
/// Any side of a square that does not have another filled square behind
/// it is on the edge. Collecting those and joining them end to end
/// gives the boundary, as one loop per separate piece.
export function outlines(cells: Set<string>): Ring[] {
  const segments = new Map<string, [number, number][]>();
  const key = (x: number, y: number) => `${x},${y}`;

  function add(ax: number, ay: number, bx: number, by: number) {
    const from = key(ax, ay);
    const list = segments.get(from) ?? [];
    list.push([bx, by]);
    segments.set(from, list);
  }

  for (const cell of cells) {
    const [x, y] = cell.split(":").map(Number);
    // wound the same way round every square, so the joined up loops
    // never double back on themselves
    if (!cells.has(`${x}:${y - 1}`)) add(x, y, x + 1, y);
    if (!cells.has(`${x + 1}:${y}`)) add(x + 1, y, x + 1, y + 1);
    if (!cells.has(`${x}:${y + 1}`)) add(x + 1, y + 1, x, y + 1);
    if (!cells.has(`${x - 1}:${y}`)) add(x, y + 1, x, y);
  }

  const rings: Ring[] = [];
  while (segments.size > 0) {
    const startKey = segments.keys().next().value as string;
    const start = startKey.split(",").map(Number) as [number, number];

    const ring: Ring = [start];
    let at = start;
    for (;;) {
      const next = segments.get(key(at[0], at[1]));
      if (!next || next.length === 0) {
        break;
      }
      const step = next.pop() as [number, number];
      if (next.length === 0) {
        segments.delete(key(at[0], at[1]));
      }
      if (step[0] === start[0] && step[1] === start[1]) {
        break;
      }
      ring.push(step);
      at = step;
    }

    // three points is the least that encloses anything
    if (ring.length >= 3) {
      rings.push(ring);
    }
  }
  return rings;
}

/// Rounds the corners off a loop by cutting them, twice.
///
/// Straight off the grid the outline is all right angles, which reads as
/// a staircase rather than an area.
export function smooth(ring: Ring, rounds = 2): Ring {
  let current = ring;
  for (let pass = 0; pass < rounds; pass++) {
    const next: Ring = [];
    for (let i = 0; i < current.length; i++) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    current = next;
  }
  return current;
}
