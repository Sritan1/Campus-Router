// Working out one frame that every race panel shares.

import type { RouteReply } from "./api";

export type Bounds = [[number, number], [number, number]];

// how much of each search has to be on screen. the last few percent of
// a bfs run are long thin tendrils that push the frame out a long way
// while saying almost nothing, and paying for them shrinks the route to
// a speck in every panel.
const COVERAGE = 0.94;

/// The box that holds both ends, the whole route, and most of the searching.
///
/// All four panels use this same box. If they framed themselves
/// independently a smaller search would just look like a closer zoom,
/// and the comparison would mean nothing.
export function raceBounds(reply: RouteReply | null): Bounds | null {
  if (!reply) {
    return null;
  }

  // these are never trimmed. the answer has to be visible.
  const required: [number, number][] = [
    [reply.start.lat, reply.start.lon],
    [reply.target.lat, reply.target.lon],
  ];
  for (const result of reply.results) {
    for (const point of result.points ?? []) {
      required.push(point);
    }
  }

  const explored: [number, number][] = [];
  for (const result of reply.results) {
    for (const point of result.trace?.points ?? []) {
      explored.push(point);
    }
  }

  if (required.length === 0) {
    return null;
  }

  // measure from the middle of the route, so trimming takes the
  // furthest wandering rather than one side of the map
  const centreLat =
    required.reduce((sum, p) => sum + p[0], 0) / required.length;
  const centreLon =
    required.reduce((sum, p) => sum + p[1], 0) / required.length;

  const kept = [...required];
  if (explored.length > 0) {
    const ranked = explored
      .map((p) => ({
        point: p,
        away: Math.max(
          Math.abs(p[0] - centreLat),
          Math.abs(p[1] - centreLon) * 0.74,
        ),
      }))
      .sort((a, b) => a.away - b.away);

    const take = Math.max(1, Math.round(ranked.length * COVERAGE));
    for (let i = 0; i < take; i++) {
      kept.push(ranked[i].point);
    }
  }

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of kept) {
    minLat = Math.min(minLat, lat);
    minLon = Math.min(minLon, lon);
    maxLat = Math.max(maxLat, lat);
    maxLon = Math.max(maxLon, lon);
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) {
    return null;
  }

  // a little air so nothing sits against the edge
  const padLat = Math.max((maxLat - minLat) * 0.05, 0.0003);
  const padLon = Math.max((maxLon - minLon) * 0.05, 0.0003);

  return [
    [minLat - padLat, minLon - padLon],
    [maxLat + padLat, maxLon + padLon],
  ];
}
