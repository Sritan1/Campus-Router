// Keeping the route in the address bar, so a link can be shared.

import type { AlgorithmName, Building, RouteMode } from "./api";

const MODES: RouteMode[] = ["shortest", "accessible", "weather"];
const ALGORITHMS: AlgorithmName[] = ["dijkstra", "astar", "bfs", "bidirectional"];

export type UrlState = {
  from: string | null;
  to: string | null;
  mode: RouteMode | null;
  race: boolean | null;
  algorithm: AlgorithmName | null;
};

export function readUrl(search: string): UrlState {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const algorithm = params.get("algo");
  const race = params.get("race");

  return {
    from: params.get("from"),
    to: params.get("to"),
    mode: MODES.includes(mode as RouteMode) ? (mode as RouteMode) : null,
    race: race === null ? null : race === "1",
    algorithm: ALGORITHMS.includes(algorithm as AlgorithmName)
      ? (algorithm as AlgorithmName)
      : null,
  };
}

export function writeUrl(input: {
  from: Building | null;
  to: Building | null;
  mode: RouteMode;
  race: boolean;
  algorithm: AlgorithmName;
}): string {
  const params = new URLSearchParams();
  // building codes make a nicer link than raw osm ids
  if (input.from) {
    params.set("from", input.from.abbr ?? input.from.id);
  }
  if (input.to) {
    params.set("to", input.to.abbr ?? input.to.id);
  }
  params.set("mode", input.mode);
  params.set("race", input.race ? "1" : "0");
  if (!input.race) {
    params.set("algo", input.algorithm);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

/// Finds the building a link is asking for.
///
/// Links carry a code like SEO, but an id works too so an older link
/// does not break.
export function findBuilding(
  buildings: Building[],
  key: string | null,
): Building | null {
  if (!key) {
    return null;
  }
  const wanted = key.trim().toLowerCase();
  return (
    buildings.find((b) => b.abbr?.toLowerCase() === wanted) ??
    buildings.find((b) => b.id.toLowerCase() === wanted) ??
    null
  );
}
