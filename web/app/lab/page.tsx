"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import ComparisonTable from "@/components/ComparisonTable";
import Header, { MODE_NOTES } from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { raceBounds, type Bounds } from "@/lib/bounds";
import {
  API_BASE,
  ApiError,
  fetchBuildings,
  fetchGraphMeta,
  fetchWeather,
  requestRoute,
  type RouteMode,
  type RouteReply,
} from "@/lib/api";
import { ALGORITHM_LABELS, temperature, wind } from "@/lib/format";
import { PLAYBACK_MS, clamp, prefersReducedMotion } from "@/lib/playback";
import { INITIAL, algorithmsFor, canRun, reduce } from "@/lib/state";
import { findBuilding, readUrl, writeUrl } from "@/lib/url";

// leaflet reaches for window as soon as it loads, so it cannot render
// on the server
const MapPane = dynamic(() => import("@/components/MapPane"), {
  ssr: false,
  loading: () => <div className="map-pane map-loading">loading map…</div>,
});

// leaflet reaches for window on import, so the grid cannot be rendered
// on the server either
const RaceGrid = dynamic(() => import("@/components/RaceGrid"), {
  ssr: false,
  loading: () => <div className="map-pane map-loading">loading maps…</div>,
});

export default function Lab() {
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

  const list = useMemo(() => buildings.data ?? [], [buildings.data]);
  const start = useMemo(
    () => list.find((b) => b.id === state.startId) ?? null,
    [list, state.startId],
  );
  const target = useMemo(
    () => list.find((b) => b.id === state.targetId) ?? null,
    [list, state.targetId],
  );

  // put a shared link back together, once, after the buildings arrive
  const restoredRef = useRef(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  useEffect(() => {
    if (restoredRef.current || list.length === 0) {
      return;
    }
    restoredRef.current = true;

    const wanted = readUrl(window.location.search);
    const from = findBuilding(list, wanted.from);
    const to = findBuilding(list, wanted.to);

    const missing = [
      wanted.from && !from ? wanted.from : null,
      wanted.to && !to ? wanted.to : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      setLinkNotice(`Could not find ${missing.join(" or ")} on campus`);
    }

    dispatch({
      type: "restore",
      patch: {
        startId: from?.id ?? null,
        targetId: to?.id ?? null,
        ...(wanted.mode ? { mode: wanted.mode } : {}),
        ...(wanted.race === null ? {} : { race: wanted.race }),
        ...(wanted.algorithm
          ? { algorithm: wanted.algorithm, selected: wanted.algorithm }
          : {}),
      },
    });
  }, [list]);

  // keep the address bar current without adding history entries
  useEffect(() => {
    if (!restoredRef.current) {
      return;
    }
    const query = writeUrl({
      from: start,
      to: target,
      mode: state.mode,
      race: state.race,
      algorithm: state.algorithm,
    });
    window.history.replaceState(null, "", `${window.location.pathname}${query}`);
  }, [start, target, state.mode, state.race, state.algorithm]);

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

  const weatherReady = Boolean(weather.data && weather.data.available !== false);

  const weatherChip = (() => {
    if (weather.isLoading) {
      return "weather…";
    }
    if (!weatherReady) {
      return "weather unavailable";
    }
    const value = weather.data as { tempC: number | null; windMps: number | null };
    return `${temperature(value.tempC)} · wind ${wind(value.windMps)}`;
  })();

  // says the same thing as a sighted user gets from the panel changing
  const liveMessage = (() => {
    if (state.error) {
      return `Routing failed. ${state.error}`;
    }
    if (state.phase === "running") {
      return state.reply ? "Showing how each algorithm searched" : "Finding routes";
    }
    if (state.phase === "results" && state.reply) {
      const ok = state.reply.results.filter((r) => r.status === "ok").length;
      return ok === 0
        ? "No route found with these settings"
        : `Found ${ok} route${ok === 1 ? "" : "s"}`;
    }
    return "";
  })();

  const sameBuilding = Boolean(
    state.startId && state.targetId && state.startId === state.targetId,
  );

  // the grid is only for racing all four. a single algorithm has
  // nothing to compare against, so it keeps the normal moveable map.
  const gridBounds = useMemo(() => raceBounds(state.reply), [state.reply]);
  const showGrid = Boolean(
    state.race &&
      state.reply &&
      gridBounds &&
      (state.phase === "running" || state.phase === "results"),
  );

  // going back to routing should keep whatever is already picked
  const navigateHref = `/${writeUrl({
    from: start,
    to: target,
    mode: state.mode,
    race: state.race,
    algorithm: state.algorithm,
  })}`;

  // without the building list there is nothing to search and nothing to
  // route between, so say so plainly rather than showing an empty box
  if (buildings.isError) {
    return (
      <main className="shell">
        <div className="fatal">
          <h1 className="fatal-title">Cannot reach the routing service</h1>
          <p className="fatal-body">
            The map and search need the backend, and it is not answering at{" "}
            <code>{API_BASE}</code>.
          </p>
          <p className="fatal-body">
            If you are running this locally, start it with{" "}
            <code>scripts/dev.ps1</code> and reload.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => buildings.refetch()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <Header
        buildings={list}
        start={start}
        target={target}
        mode={state.mode}
        searchFor={state.searchFor}
        actionLabel={state.race ? "Race" : "Find route"}
        busy={state.phase === "running"}
        weatherReady={weatherReady}
        otherMode={{ href: navigateHref, label: "Back to routing" }}
        onOpenSearch={(which) => dispatch({ type: "openSearch", which })}
        onCloseSearch={() => dispatch({ type: "closeSearch" })}
        onPick={(which, b) => dispatch({ type: "pickBuilding", which, id: b.id })}
        onSwap={() => dispatch({ type: "swapEnds" })}
        onMode={(mode) => dispatch({ type: "setMode", mode })}
        onRun={run}
      />

      {linkNotice || sameBuilding ? (
        <div className="notice" role="status">
          {sameBuilding
            ? "Start and destination are the same building."
            : linkNotice}
          {linkNotice && !sameBuilding ? (
            <button
              type="button"
              className="link-button"
              onClick={() => setLinkNotice(null)}
            >
              dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      <div className="body">
        {showGrid ? (
          <div className="map-wrap" role="region" aria-label="algorithm comparison">
            <RaceGrid
              reply={state.reply as RouteReply}
              bounds={gridBounds as Bounds}
              playing={state.phase === "running"}
              startedAt={startedAt}
              reducedMotion={reducedMotion}
              selected={state.selected}
              onSelect={(algorithm) => dispatch({ type: "selectLane", algorithm })}
            />
            <p className="grid-credit">
              Map data ©{" "}
              <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{" "}
              contributors · panels are locked to one frame so the searches can
              be compared
            </p>
          </div>
        ) : (
        <div className="map-wrap" role="region" aria-label="campus map">
          <MapPane
            reply={state.reply}
            selected={state.selected}
            meta={meta.data ?? null}
            playing={state.phase === "running"}
            startedAt={startedAt}
            reducedMotion={reducedMotion}
          />
          {/* darkens the tiles while exploring so the trace reads,
              then fades back out */}
          <div
            className={`scrim${state.phase === "running" && state.reply ? " is-on" : ""}`}
            aria-hidden="true"
          />
          <div className="chip chip-mode">{MODE_NOTES[state.mode]}</div>
          <div className="chip chip-weather">{weatherChip}</div>
          {legend ? <div className="chip chip-legend">{legend}</div> : null}
        </div>
        )}

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
