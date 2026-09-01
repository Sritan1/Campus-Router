// Turning numbers into the strings the panels show.

const METRES_PER_MILE = 1609.344;

export function distance(metres: number | undefined): string {
  if (metres === undefined) {
    return "—";
  }
  const miles = metres / METRES_PER_MILE;
  if (miles < 0.1) {
    return `${Math.round(metres)} m`;
  }
  return `${miles.toFixed(2)} mi`;
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
  dijkstra: "weighted, exhaustive",
  astar: "straight line heuristic",
  bfs: "fewest hops, unweighted",
  bidirectional: "meet in the middle",
};

export const ALGORITHM_COLORS: Record<string, string> = {
  dijkstra: "#e0803a",
  astar: "#2a78d6",
  bfs: "#7a9bc4",
  bidirectional: "#59a14f",
};
