"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import BuildingSearch from "@/components/BuildingSearch";
import ComparisonTable from "@/components/ComparisonTable";
import Sidebar from "@/components/Sidebar";
import {
  ApiError,
  fetchBuildings,
  fetchGraphMeta,
  fetchWeather,
  requestRoute,
  type RouteMode,
} from "@/lib/api";
import { ALGORITHM_LABELS, temperature, wind } from "@/lib/format";
import { PLAYBACK_MS, clamp, prefersReducedMotion } from "@/lib/playback";
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

  // playback clock. the canvas runs its own frames off startedAt so it
  // stays smooth, while react only re-renders for the sidebar bars.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

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

  const stopClock = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /// Ticks the sidebar bars while the canvas animates.
  ///
  /// Twenty times a second is plenty for a bar, and it keeps react out
  /// of the sixty frame loop the canvas is running.
  const startClock = useCallback(() => {
    stopClock();
    const began = performance.now();
    setStartedAt(began);
    setProgress(0);

    if (reducedMotion) {
      setProgress(1);
      dispatch({ type: "finished" });
      return;
    }

    timerRef.current = window.setInterval(() => {
      const p = clamp((performance.now() - began) / PLAYBACK_MS);
      setProgress(p);
      if (p >= 1) {
        stopClock();
        dispatch({ type: "finished" });
      }
    }, 50);
  }, [reducedMotion, stopClock]);

  useEffect(() => stopClock, [stopClock]);

  const skip = useCallback(() => {
    stopClock();
    setProgress(1);
    dispatch({ type: "finished" });
  }, [stopClock]);

  const run = useCallback(async () => {
    if (!canRun(state)) {
      dispatch({ type: "run" });
      return;
    }
    stopClock();
    setStartedAt(null);
    setProgress(0);
    dispatch({ type: "run" });

    try {
      const reply = await requestRoute({
        start: state.startId as string,
        target: state.targetId as string,
        mode: state.mode,
        algorithms: algorithmsFor(state),
        trace: true,
      });
      dispatch({ type: "arrived", reply });
      startClock();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "could not reach the routing service";
      dispatch({ type: "failed", message });
    }
  }, [state, startClock, stopClock]);

  const replay = useCallback(() => {
    dispatch({ type: "replay" });
    startClock();
  }, [startClock]);

  const showShortest = useCallback(() => {
    dispatch({ type: "setMode", mode: "shortest" });
    // the mode change clears the result, so ask again straight away
    setTimeout(run, 0);
  }, [run]);

  // says which line is which, so the dashed grey ones are not a mystery
  const legend = (() => {
    if (state.phase !== "results" || !state.reply) {
      return null;
    }
    const drawn = ALGORITHM_LABELS[state.selected] ?? state.selected;
    const group = state.reply.pathGroups.find((g) =>
      g.algorithms.includes(state.selected),
    );
    const shared =
      group && group.algorithms.length > 1
        ? ` · ${group.algorithms.length} algorithms agree`
        : "";
    const others = state.reply.pathGroups.length > 1 ? " · dashed = other paths" : "";
    return `drawn: ${drawn}${shared}${others}`;
  })();

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
            playing={state.phase === "running"}
            startedAt={startedAt}
            reducedMotion={reducedMotion}
          />
          <div className="chip chip-mode">{MODE_NOTES[state.mode]}</div>
          <div className="chip chip-weather">{weatherChip}</div>
          {legend ? <div className="chip chip-legend">{legend}</div> : null}
        </div>

        <aside className="sidebar">
          <Sidebar
            state={state}
            progress={progress}
            canRun={canRun(state)}
            onPickAlgorithm={(algorithm) =>
              dispatch({ type: "pickAlgorithm", algorithm })
            }
            onToggleRace={() => dispatch({ type: "toggleRace" })}
            onSelectLane={(algorithm) => dispatch({ type: "selectLane", algorithm })}
            onRun={run}
            onReset={() => dispatch({ type: "reset" })}
            onShowShortest={showShortest}
            onSkip={skip}
            onReplay={replay}
            onToggleTable={() => dispatch({ type: "toggleTable" })}
          />
        </aside>
      </div>

      {state.showTable && state.phase === "results" && state.reply ? (
        <ComparisonTable
          reply={state.reply}
          selected={state.selected}
          onClose={() => dispatch({ type: "toggleTable" })}
        />
      ) : null}
    </main>
  );
}
