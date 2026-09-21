// one frame that every race panel shares

import type { RouteReply } from "./api";

export type Bounds = [[number, number], [number, number]];

// the tail of a bfs run is thin tendrils that would shrink the route to a speck
const COVERAGE = 0.94;

// the reach area is drawn wider than its points, so framing on raw points clips it
export function boundsAround(
  points: [number, number][],
  margin: number,
): Bounds | null {
  if (points.length === 0) {
    return null;
  }

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of points) {
    minLat = Math.min(minLat, lat);
    minLon = Math.min(minLon, lon);
    maxLat = Math.max(maxLat, lat);
    maxLon = Math.max(maxLon, lon);
  }

  // a floor as well as a fraction, so a tiny area still gets some air
  const padLat = Math.max((maxLat - minLat) * margin, 0.0004);
  const padLon = Math.max((maxLon - minLon) * margin, 0.0004);

  return [
    [minLat - padLat, minLon - padLon],
    [maxLat + padLat, maxLon + padLon],
  ];
}

// all four panels share this box, or a smaller search would look like a closer
// zoom. the single map passes a coverage of 1, since it has the room
export function raceBounds(
  reply: RouteReply | null,
  coverage = COVERAGE,
): Bounds | null {
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

  // measured from the middle of the route, so trimming takes the furthest strays
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

    const take = Math.max(1, Math.round(ranked.length * coverage));
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
