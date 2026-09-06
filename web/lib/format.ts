// Turning numbers into the strings the panels show.

import type { RouteMode } from "./api";

const METRES_PER_MILE = 1609.344;

/// What each mode is called, everywhere. The picker, the reach receipt
/// and the lab all read from here so they cannot drift apart.
export const MODE_LABEL: Record<RouteMode, string> = {
  shortest: "Shortest",
  accessible: "Accessible",
  weather: "Weather",
};

/// Metres up to a kilometre, miles past that.
///
/// Campus walks are a few hundred metres, and two decimal places of a
/// mile is too coarse to tell them apart. Dijkstra at 367 m and bfs at
/// 373 m both came out as "0.23 mi", which hid the whole point of the
/// race.
export function distance(metres: number | undefined): string {
  if (metres === undefined) {
    return "—";
  }
  if (metres < 1000) {
    return `${Math.round(metres)} m`;
  }
  return `${(metres / METRES_PER_MILE).toFixed(2)} mi`;
}

export function duration(seconds: number | undefined): string {
  if (seconds === undefined) {
    return "—";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return "under a minute";
  }
  return `${minutes} min`;
}

export function count(value: number | undefined): string {
  if (value === undefined) {
    return "—";
  }
  return value.toLocaleString("en-US");
}

/// Runtimes come back in microseconds and are often under a millisecond,
/// so rounding to whole milliseconds would show a lot of zeroes.
export function runtime(micros: number | undefined): string {
  if (micros === undefined) {
    return "—";
  }
  if (micros < 1000) {
    return `${micros} µs`;
  }
  return `${(micros / 1000).toFixed(1)} ms`;
}

export function temperature(celsius: number | null | undefined): string {
  if (celsius === null || celsius === undefined) {
    return "—";
  }
  const fahrenheit = celsius * 9 / 5 + 32;
  return `${Math.round(fahrenheit)}°F`;
}

export function wind(metresPerSecond: number | null | undefined): string {
  if (metresPerSecond === null || metresPerSecond === undefined) {
    return "—";
  }
  return `${Math.round(metresPerSecond * 2.23694)} mph`;
}

export const ALGORITHM_LABELS: Record<string, string> = {
  dijkstra: "Dijkstra",
  astar: "A*",
  bfs: "BFS",
  bidirectional: "Bidirectional Dijkstra",
};

export const ALGORITHM_NOTES: Record<string, string> = {
  dijkstra: "Checks everything",
  astar: "Aims at the target",
  bfs: "Fewest edges, ignores distance",
  bidirectional: "Searches from both ends",
};

export const ALGORITHM_COLORS: Record<string, string> = {
  dijkstra: "#e0803a",
  astar: "#2a78d6",
  bfs: "#7a9bc4",
  bidirectional: "#59a14f",
};

// line weights, kept together so they are easy to tune
export const LINE = {
  // the search spreading across the map
  trace: 2.8,
  traceAlpha: 0.7,
  // the route it settled on
  route: 8,
  // a different path another algorithm took
  alternate: 4.5,
};
