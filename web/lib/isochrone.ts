// the shape of everywhere you can walk to

// one area, one colour. sub bands claimed a precision walking speed does not have
export const REGION_COLOUR = "#2a78d6";

export type Ring = [number, number][];

// joins paths that run alongside each other into one area
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

// a side with no filled square behind it is edge. joined end to end, those
// give one loop per separate piece
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
    // wound the same way round every square, so joined loops never double back
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

function offLine(
  point: [number, number],
  from: [number, number],
  to: [number, number],
): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const span = Math.hypot(dx, dy);
  if (span === 0) {
    return Math.hypot(point[0] - from[0], point[1] - from[1]);
  }
  const cross = Math.abs(dx * (from[1] - point[1]) - (from[0] - point[0]) * dy);
  return cross / span;
}

// douglas peucker. off the grid the outline is hundreds of little right angles
function thin(points: Ring, tolerance: number): Ring {
  if (points.length < 3) {
    return points;
  }

  let worst = 0;
  let at = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const gap = offLine(points[i], points[0], points[last]);
    if (gap > worst) {
      worst = gap;
      at = i;
    }
  }

  if (worst <= tolerance) {
    return [points[0], points[last]];
  }

  const left = thin(points.slice(0, at + 1), tolerance);
  const right = thin(points.slice(at), tolerance);
  return [...left.slice(0, -1), ...right];
}

// in grid cells. enough to lose the staircase, not enough to cut off a block corner
export const SIMPLIFY_CELLS = 1.2;

// cut in two first, since a closed ring thinned whole leaves a flat spot at its ends
export function simplify(ring: Ring, tolerance = SIMPLIFY_CELLS): Ring {
  if (ring.length < 4) {
    return ring;
  }

  const half = Math.floor(ring.length / 2);
  const front = thin([...ring.slice(0, half + 1)], tolerance);
  const back = thin([...ring.slice(half), ring[0]], tolerance);
  const joined = [...front.slice(0, -1), ...back.slice(0, -1)];

  // never hand back something too small to be a shape
  return joined.length >= 3 ? joined : ring;
}
