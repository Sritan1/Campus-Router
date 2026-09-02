// Working out one frame that every race panel shares.

import type { RouteReply } from "./api";

export type Bounds = [[number, number], [number, number]];

/// The box that holds every search and both ends of the route.
///
/// All four panels use this same box. If they framed themselves
/// independently a smaller search would just look like a closer zoom,
/// and the comparison would mean nothing.
export function raceBounds(reply: RouteReply | null): Bounds | null {
  if (!reply) {
    return null;
  }

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;

  function include(lat: number, lon: number) {
    minLat = Math.min(minLat, lat);
    minLon = Math.min(minLon, lon);
    maxLat = Math.max(maxLat, lat);
    maxLon = Math.max(maxLon, lon);
  }

  for (const result of reply.results) {
    for (const point of result.trace?.points ?? []) {
      include(point[0], point[1]);
    }
    for (const point of result.points ?? []) {
      include(point[0], point[1]);
    }
  }

  // the endpoints matter even when nothing found a route
  include(reply.start.lat, reply.start.lon);
  include(reply.target.lat, reply.target.lon);

  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) {
    return null;
  }

  // a little air so nothing sits against the edge
  const padLat = Math.max((maxLat - minLat) * 0.08, 0.0004);
  const padLon = Math.max((maxLon - minLon) * 0.08, 0.0004);

  return [
    [minLat - padLat, minLon - padLon],
    [maxLat + padLat, maxLon + padLon],
  ];
}
