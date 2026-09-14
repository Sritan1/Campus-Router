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

// The four, and the three modes, named once. Both types are read back off
// the list, so adding one here is the only edit and nothing can end up
// holding a shorter copy of it.
export const ALGORITHMS = ["dijkstra", "astar", "bfs", "bidirectional"] as const;
export const MODES = ["shortest", "accessible", "weather"] as const;

export type RouteMode = (typeof MODES)[number];

export type AlgorithmName = (typeof ALGORITHMS)[number];

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
    // paths the engine had to drop because only one end survived thinning.
    // the engine reports this so a caller can tell the search arrived in
    // pieces, which is the bug that cost the most time on this project.
    droppedEdges: number;
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

export type DirectionStep = {
  text: string;
  metres: number;
  kind: "start" | "walk" | "crossing" | "steps" | "end";
};

export type Directions = {
  turns: number;
  crossings: number;
  /// share of the walk on a real footpath rather than a road
  onFootpath: number;
  steps: DirectionStep[];
};

export type RouteReply = {
  start: Building;
  target: Building;
  mode: RouteMode;
  results: AlgorithmResult[];
  directions: Directions | null;
  pathGroups: PathGroup[];
  cost: {
    source: string;
    notes: string[];
    blockedClasses: number;
    adjustedClasses: number;
    walkingSpeedMps: number;
    // whether the time estimate was taken off the weighted walk or the
    // plain one, which is the difference between weather mode and the rest
    speedDerived: boolean;
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
  /// the day the openstreetmap data was pulled, for the about page
  extracted?: string | null;
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

// The gateway can wait six seconds on weather and five on the engine, so
// a request that has taken this long is not coming back. Without it a
// hung backend leaves the panel spinning with no way out of it.
const REQUEST_TIMEOUT_MS = 20000;

// Reading the body happens in here rather than in the callers, because
// fetch resolves as soon as the headers land. Clearing the timer before
// the body is read leaves a stalled reply with nothing to cancel it.
async function ask<T>(path: string, init?: RequestInit): Promise<T> {
  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), REQUEST_TIMEOUT_MS);
  try {
    const reply = await fetch(`${API_BASE}${path}`, { ...init, signal: giveUp.signal });
    if (!reply.ok) {
      throw new ApiError(reply.status, await readError(reply));
    }
    return (await reply.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function get<T>(path: string): Promise<T> {
  return ask<T>(path);
}

async function post<T>(path: string, input: unknown): Promise<T> {
  return ask<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// what to say when the reply carries no reason we can show. a status code
// on its own is not something anyone reading it can do anything with.
const NO_REASON = "Something went wrong at our end. Try again in a moment.";

async function readError(reply: Response): Promise<string> {
  try {
    const body = await reply.json();
    return body.detail ?? body.error ?? NO_REASON;
  } catch {
    // a non json error body is still an error, just a less useful one
    return NO_REASON;
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
  return post<Isochrone>("/api/isochrone", input);
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
  return post<RouteReply>("/api/route", input);
}
