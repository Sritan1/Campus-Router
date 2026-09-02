// Everything that talks to the gateway lives here, so the components
// never build a url themselves.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type Building = {
  id: string;
  nodeId: number;
  name: string;
  abbr: string | null;
  aliases: string[];
  wheelchair: string | null;
  lat: number;
  lon: number;
};

export type RouteMode = "shortest" | "accessible" | "weather";

export type AlgorithmName = "dijkstra" | "astar" | "bfs" | "bidirectional";

export type AlgorithmResult = {
  algorithm: AlgorithmName;
  status: "ok" | "no_path";
  cost?: number;
  distanceM?: number;
  estSeconds?: number;
  hops?: number;
  nodesVisited: number;
  edgesRelaxed: number;
  runtimeUs: number;
  path?: number[];
  points?: [number, number][];
  trace?: {
    points: [number, number][];
    // the paths the search walked, as pairs of indices into points
    edges: [number, number][];
    sampled: boolean;
    total: number;
  };
};

export type PathGroup = { algorithms: AlgorithmName[] };

export type Weather = {
  tempC: number | null;
  feelsLikeC: number | null;
  windMps: number | null;
  condition: string | null;
  description: string | null;
  stale?: boolean;
};

export type RouteReply = {
  start: Building;
  target: Building;
  mode: RouteMode;
  results: AlgorithmResult[];
  pathGroups: PathGroup[];
  cost: {
    source: string;
    notes: string[];
    blockedClasses: number;
    adjustedClasses: number;
    walkingSpeedMps: number;
  };
  weather: Weather | null;
};

export type GraphMeta = {
  counts: { nodes: number; edges: number; buildings: number; classes: number };
  campusBounds: {
    minlat: number;
    minlon: number;
    maxlat: number;
    maxlon: number;
  } | null;
  classes: number;
};

export type Isochrone = {
  start: Building;
  mode: RouteMode;
  minutes: number;
  points: [number, number][];
  edges: [number, number][];
  /// how long it takes to reach each path, in seconds
  edgeSeconds: number[];
  /// buildings inside the area, nearest first, with how long they take
  buildings: (Building & { seconds: number })[];
  reached: number;
  runtimeUs: number;
  walkingSpeedMps?: number;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  const reply = await fetch(`${API_BASE}${path}`);
  if (!reply.ok) {
    throw new ApiError(reply.status, await readError(reply));
  }
  return reply.json() as Promise<T>;
}

async function readError(reply: Response): Promise<string> {
  try {
    const body = await reply.json();
    return body.detail ?? body.error ?? `request failed with ${reply.status}`;
  } catch {
    // a non json error body is still an error, just a less useful one
    return `request failed with ${reply.status}`;
  }
}

export async function fetchBuildings(): Promise<Building[]> {
  const body = await get<{ buildings: Building[] }>("/api/buildings?limit=500");
  return body.buildings;
}

export async function fetchGraphMeta(): Promise<GraphMeta> {
  return get<GraphMeta>("/api/graph/meta");
}

export async function fetchWeather(): Promise<
  ({ available: true } & Weather) | { available: false; reason: string }
> {
  return get("/api/weather");
}

export async function requestIsochrone(input: {
  start: string;
  mode: RouteMode;
  minutes: number;
}): Promise<Isochrone> {
  const reply = await fetch(`${API_BASE}/api/isochrone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!reply.ok) {
    throw new ApiError(reply.status, await readError(reply));
  }
  return reply.json();
}

export async function requestRoute(input: {
  start: string;
  target: string;
  mode: RouteMode;
  algorithms: AlgorithmName[];
  trace: boolean;
}): Promise<RouteReply> {
  // no sample limit on purpose. thinning drops points, and a path only
  // survives if both of its ends do, so asking for half the points threw
  // away three quarters of the paths and the search came out in pieces.
  const reply = await fetch(`${API_BASE}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!reply.ok) {
    throw new ApiError(reply.status, await readError(reply));
  }
  return reply.json();
}
