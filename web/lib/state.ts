// The idle, running and results machine the prototype uses.
// Kept separate from the components so it can be tested on its own.

import type { AlgorithmName, RouteMode, RouteReply } from "./api";

export type Phase = "idle" | "running" | "results";
export type SearchTarget = "start" | "target" | null;

export type AppState = {
  phase: Phase;
  mode: RouteMode;
  race: boolean;
  algorithm: AlgorithmName;
  selected: AlgorithmName;
  startId: string | null;
  targetId: string | null;
  searchFor: SearchTarget;
  reply: RouteReply | null;
  error: string | null;
  showTable: boolean;
};

export const INITIAL: AppState = {
  phase: "idle",
  mode: "shortest",
  race: true,
  algorithm: "astar",
  selected: "astar",
  // start empty. the prototype prefilled a building the user never picked,
  // which reads as a bug outside a wireframe.
  startId: null,
  targetId: null,
  searchFor: null,
  reply: null,
  error: null,
  showTable: false,
};

export type Action =
  | { type: "openSearch"; which: Exclude<SearchTarget, null> }
  | { type: "closeSearch" }
  | { type: "pickBuilding"; which: Exclude<SearchTarget, null>; id: string }
  | { type: "swapEnds" }
  | { type: "setMode"; mode: RouteMode }
  | { type: "pickAlgorithm"; algorithm: AlgorithmName }
  | { type: "toggleRace" }
  | { type: "selectLane"; algorithm: AlgorithmName }
  | { type: "toggleTable" }
  | { type: "run" }
  | { type: "arrived"; reply: RouteReply }
  | { type: "finished" }
  | { type: "replay" }
  | { type: "failed"; message: string }
  | { type: "restore"; patch: Partial<AppState> }
  | { type: "reset" };

/// Anything that changes what a route would be has to invalidate the one
/// on screen, otherwise the map shows an answer to a different question.
function staleAfterChange(state: AppState): Partial<AppState> {
  return { phase: "idle", reply: null, error: null, showTable: false };
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "openSearch":
      return { ...state, searchFor: action.which };

    case "closeSearch":
      return { ...state, searchFor: null };

    case "pickBuilding": {
      const key = action.which === "start" ? "startId" : "targetId";
      return {
        ...state,
        [key]: action.id,
        searchFor: null,
        ...staleAfterChange(state),
      };
    }

    case "swapEnds":
      return {
        ...state,
        startId: state.targetId,
        targetId: state.startId,
        ...staleAfterChange(state),
      };

    case "setMode":
      if (state.mode === action.mode) {
        return state;
      }
      return { ...state, mode: action.mode, ...staleAfterChange(state) };

    case "pickAlgorithm":
      return {
        ...state,
        algorithm: action.algorithm,
        selected: action.algorithm,
        race: false,
        ...staleAfterChange(state),
      };

    case "toggleRace":
      return {
        ...state,
        race: !state.race,
        selected: state.race ? state.algorithm : "astar",
        ...staleAfterChange(state),
      };

    case "selectLane":
      return { ...state, selected: action.algorithm };

    case "toggleTable":
      return { ...state, showTable: !state.showTable };

    case "run":
      if (!state.startId || !state.targetId) {
        // nothing to run yet, so open the field that is still empty
        return { ...state, searchFor: state.startId ? "target" : "start" };
      }
      return { ...state, phase: "running", error: null, reply: null };

    case "arrived": {
      // the data is here but the exploration still has to play out, so
      // we stay in running with a result attached
      const first = action.reply.results.find((r) => r.status === "ok");
      return {
        ...state,
        reply: action.reply,
        error: null,
        selected: state.race
          ? (first?.algorithm ?? state.selected)
          : state.algorithm,
      };
    }

    case "finished":
      if (!state.reply) {
        return state;
      }
      return { ...state, phase: "results" };

    case "replay":
      if (!state.reply) {
        return state;
      }
      // nothing to fetch, we already have the traces
      return { ...state, phase: "running", showTable: false };

    case "failed":
      return { ...state, phase: "idle", error: action.message, reply: null };

    case "restore":
      // used once on load to put a shared link back together
      return { ...state, ...action.patch };

    case "reset":
      return { ...INITIAL, mode: state.mode, race: state.race, algorithm: state.algorithm };

    default:
      return state;
  }
}

export function algorithmsFor(state: AppState): AlgorithmName[] {
  return state.race
    ? ["dijkstra", "astar", "bfs", "bidirectional"]
    : [state.algorithm];
}

export function canRun(state: AppState): boolean {
  return Boolean(state.startId && state.targetId && state.startId !== state.targetId);
}
