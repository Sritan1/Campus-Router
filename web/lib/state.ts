// the lab idle, running and results machine, kept apart so it can be tested

import { ALGORITHMS } from "./api";
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
  // start empty, a prefilled building nobody picked reads as a bug
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
  | { type: "setRace"; race: boolean }
  | { type: "selectLane"; algorithm: AlgorithmName }
  | { type: "toggleTable" }
  | { type: "run" }
  | { type: "arrived"; reply: RouteReply }
  | { type: "finished" }
  | { type: "replay" }
  | { type: "failed"; message: string }
  | { type: "restore"; patch: Partial<AppState> }
  | { type: "reset" };

// anything that changes the question has to clear the answer on screen
function staleAfterChange(): Partial<AppState> {
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
        ...staleAfterChange(),
      };
    }

    case "swapEnds":
      return {
        ...state,
        startId: state.targetId,
        targetId: state.startId,
        ...staleAfterChange(),
      };

    case "setMode":
      if (state.mode === action.mode) {
        return state;
      }
      return { ...state, mode: action.mode, ...staleAfterChange() };

    case "pickAlgorithm":
      return {
        ...state,
        algorithm: action.algorithm,
        selected: action.algorithm,
        race: false,
        ...staleAfterChange(),
      };

    // set rather than flip, so a caller running in the same click knows what it asked for
    case "setRace":
      if (state.race === action.race) {
        return state;
      }
      return {
        ...state,
        race: action.race,
        selected: action.race ? "astar" : state.algorithm,
        ...staleAfterChange(),
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
      // the exploration still has to play, so stay in running
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
      // the pair stays, retyping both to change one algorithm is a chore
      return {
        ...INITIAL,
        mode: state.mode,
        race: state.race,
        algorithm: state.algorithm,
        startId: state.startId,
        targetId: state.targetId,
      };

    default:
      return state;
  }
}

export function algorithmsFor(state: AppState): AlgorithmName[] {
  return state.race ? [...ALGORITHMS] : [state.algorithm];
}

export function canRun(state: AppState): boolean {
  return Boolean(state.startId && state.targetId && state.startId !== state.targetId);
}
