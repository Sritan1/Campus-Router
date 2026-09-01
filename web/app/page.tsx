"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useReducer } from "react";

import BuildingSearch from "@/components/BuildingSearch";
import Sidebar from "@/components/Sidebar";
import {
  ApiError,
  fetchBuildings,
  fetchGraphMeta,
  fetchWeather,
  requestRoute,
  type RouteMode,
} from "@/lib/api";
import { temperature, wind } from "@/lib/format";
import { INITIAL, algorithmsFor, canRun, reduce } from "@/lib/state";

// leaflet reaches for window as soon as it loads, so it cannot render
// on the server
const MapPane = dynamic(() => import("@/components/MapPane"), {
  ssr: false,
  loading: () => <div className="map-pane map-loading">loading map…</div>,
});

const MODES: { id: RouteMode; label: string }[] = [
  { id: "shortest", label: "Shortest" },
  { id: "accessible", label: "Accessible" },
  { id: "weather", label: "Weather" },
];

const MODE_NOTES: Record<RouteMode, string> = {
  shortest: "shortest distance, nothing weighted",
  accessible: "steps avoided, rough surfaces discouraged",
  weather: "surface state inferred from the weather",
};

export default function Home() {
  const [state, dispatch] = useReducer(reduce, INITIAL);

  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: fetchBuildings,
    staleTime: Infinity,
  });

  const meta = useQuery({
    queryKey: ["graphMeta"],
    queryFn: fetchGraphMeta,
    staleTime: Infinity,
  });

  const weather = useQuery({
    queryKey: ["weather"],
    queryFn: fetchWeather,
    refetchInterval: 10 * 60 * 1000,
  });

  const list = buildings.data ?? [];
  const start = useMemo(
    () => list.find((b) => b.id === state.startId) ?? null,
    [list, state.startId],
  );
  const target = useMemo(
    () => list.find((b) => b.id === state.targetId) ?? null,
    [list, state.targetId],
  );

  const run = useCallback(async () => {
    if (!canRun(state)) {
      dispatch({ type: "run" });
      return;
    }
    dispatch({ type: "run" });
    try {
      const reply = await requestRoute({
        start: state.startId as string,
        target: state.targetId as string,
        mode: state.mode,
        algorithms: algorithmsFor(state),
        trace: false,
      });
      dispatch({ type: "succeeded", reply });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "could not reach the routing service";
      dispatch({ type: "failed", message });
    }
  }, [state]);

  const showShortest = useCallback(() => {
    dispatch({ type: "setMode", mode: "shortest" });
    // the mode change clears the result, so ask again straight away
    setTimeout(run, 0);
  }, [run]);

  const weatherChip = (() => {
    if (weather.isLoading) {
      return "weather…";
    }
    if (!weather.data || weather.data.available === false) {
      return "weather unavailable";
    }
    return `${temperature(weather.data.tempC)} · wind ${wind(weather.data.windMps)}`;
  })();

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Campus Router</div>

        <div className="ends">
          <BuildingSearch
            label="START"
            placeholder="Search a building…"
            buildings={list}
            chosen={start}
            open={state.searchFor === "start"}
            onOpen={() => dispatch({ type: "openSearch", which: "start" })}
            onClose={() => dispatch({ type: "closeSearch" })}
            onPick={(b) =>
              dispatch({ type: "pickBuilding", which: "start", id: b.id })
            }
          />

          <button
            type="button"
            className="swap"
            onClick={() => dispatch({ type: "swapEnds" })}
            title="swap start and destination"
            aria-label="swap start and destination"
          >
            →
          </button>

          <BuildingSearch
            label="DESTINATION"
            placeholder="Search a building…"
            buildings={list}
            chosen={target}
            open={state.searchFor === "target"}
            onOpen={() => dispatch({ type: "openSearch", which: "target" })}
            onClose={() => dispatch({ type: "closeSearch" })}
            onPick={(b) =>
              dispatch({ type: "pickBuilding", which: "target", id: b.id })
            }
          />
        </div>

        <div className="segmented" role="group" aria-label="routing mode">
          {MODES.map((mode) => (
            <button
              type="button"
              key={mode.id}
              className={state.mode === mode.id ? "is-active" : ""}
              aria-pressed={state.mode === mode.id}
              onClick={() => dispatch({ type: "setMode", mode: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="primary"
          onClick={run}
          disabled={state.phase === "running"}
        >
          {state.race ? "Race" : "Find route"}
        </button>
      </header>

      <div className="body">
        <div className="map-wrap">
          <MapPane
            reply={state.reply}
            selected={state.selected}
            meta={meta.data ?? null}
          />
          <div className="chip chip-mode">{MODE_NOTES[state.mode]}</div>
          <div className="chip chip-weather">{weatherChip}</div>
        </div>

        <aside className="sidebar">
          <Sidebar
            state={state}
            canRun={canRun(state)}
            onPickAlgorithm={(algorithm) =>
              dispatch({ type: "pickAlgorithm", algorithm })
            }
            onToggleRace={() => dispatch({ type: "toggleRace" })}
            onSelectLane={(algorithm) => dispatch({ type: "selectLane", algorithm })}
            onRun={run}
            onReset={() => dispatch({ type: "reset" })}
            onShowShortest={showShortest}
          />
        </aside>
      </div>
    </main>
  );
}
