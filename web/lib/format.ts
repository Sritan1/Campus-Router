import type { RouteMode } from "./api";

const METRES_PER_MILE = 1609.344;

// the one place modes are named, so the picker, receipt and lab cannot drift
export const MODE_LABEL: Record<RouteMode, string> = {
  shortest: "Shortest",
  accessible: "Accessible",
  weather: "Weather",
};

// metres under a kilometre, since two decimals of a mile hid a 367 m against 373 m race
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

// never zero, since a building you can walk to is not an under a minute walk
export function walkMinutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

export function count(value: number | undefined): string {
  if (value === undefined) {
    return "—";
  }
  return value.toLocaleString("en-US");
}

// often under a millisecond, so whole milliseconds would show zeroes
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
  trace: 2.8,
  traceAlpha: 0.7,
  route: 8,
  // a different path another algorithm took
  alternate: 4.5,
};
