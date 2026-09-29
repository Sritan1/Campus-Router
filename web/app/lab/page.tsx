"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import ComparisonTable from "@/components/ComparisonTable";
import Header from "@/components/Header";
import MapFailed from "@/components/MapFailed";
import Sidebar from "@/components/Sidebar";
import { raceBounds, type Bounds } from "@/lib/bounds";
import {
  API_BASE,
  ApiError,
  requestRoute,
  type RouteMode,
  type RouteReply,
} from "@/lib/api";
import { ALGORITHM_LABELS } from "@/lib/format";
import { PLAYBACK_MS, clamp, prefersReducedMotion } from "@/lib/playback";
import { MAPTILER_LOGO } from "@/lib/tiles";
import {
  INITIAL,
  algorithmsFor,
  canRun,
  reduce,
  type AppState,
} from "@/lib/state";
import { writeUrl } from "@/lib/url";
import { useCampus, useRestoreFromUrl, useWriteUrl } from "@/lib/use-campus";
import { useSheet } from "@/lib/use-sheet";

// leaflet reaches for window as soon as it loads, so no server rendering
const MapPane = dynamic(() => import("@/components/MapPane").catch(() => MapFailed), {
  ssr: false,
  loading: () => <div className="map-pane map-loading">Loading the map…</div>,
});

const RaceGrid = dynamic(() => import("@/components/RaceGrid").catch(() => MapFailed), {
  ssr: false,
  loading: () => <div className="map-pane map-loading">Loading the maps…</div>,
});

export default function Lab() {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const { sheetClass, handleProps } = useSheet();

  // the canvas runs its own frames off startedAt, react only renders the bars
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  const { buildings, meta, list, weatherReady, weatherChip } = useCampus();

  const start = useMemo(
    () => list.find((b) => b.id === state.startId) ?? null,
    [list, state.startId],
  );
  const target = useMemo(
    () => list.find((b) => b.id === state.targetId) ?? null,
    [list, state.targetId],
  );

  // the same hook navigate uses, so an unknown building reads the same on both
  const {
    notice: linkNotice,
    setNotice: setLinkNotice,
    restored,
  } = useRestoreFromUrl(list, ({ start: from, target: to, wanted }) => {
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
  });

  useWriteUrl(restored.current, {
    from: start,
    to: target,
    mode: state.mode,
    race: state.race,
    algorithm: state.algorithm,
  });

  const stopClock = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // twenty ticks a second is plenty for a bar and keeps react out of the canvas loop
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

  const tickets = useRef(0);
  const waitingOn = useRef<number | null>(null);
  waitingOn.current = state.request;

  // takes the state to run, so racing on and running work in one click
  const runWith = useCallback(
    async (wanted: AppState) => {
      const request = ++tickets.current;
      if (!canRun(wanted)) {
        dispatch({ type: "run", request });
        return;
      }
      stopClock();
      setStartedAt(null);
      setProgress(0);
      dispatch({ type: "run", request });

      try {
        const reply = await requestRoute({
          start: wanted.startId as string,
          target: wanted.targetId as string,
          mode: wanted.mode,
          algorithms: algorithmsFor(wanted),
          trace: true,
        });
        if (waitingOn.current !== request) {
          return;
        }
        dispatch({ type: "arrived", request, reply });
        startClock();
      } catch (error) {
        if (waitingOn.current !== request) {
          return;
        }
        const message =
          error instanceof ApiError
            ? error.message
            : "We could not reach the routing service. Try again in a moment.";
        dispatch({ type: "failed", request, message });
      }
    },
    [startClock, stopClock],
  );

  const run = useCallback(() => runWith(state), [runWith, state]);

  const raceAll = useCallback(() => {
    dispatch({ type: "setRace", race: true });
    return runWith({ ...state, race: true, selected: "astar" });
  }, [runWith, state]);

  const replay = useCallback(() => {
    dispatch({ type: "replay" });
    startClock();
  }, [startClock]);

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

  // the grid only when racing all four, a single run keeps the normal map
  const gridBounds = useMemo(() => raceBounds(state.reply), [state.reply]);
  const showGrid = Boolean(
    state.race &&
      state.reply &&
      gridBounds &&
      (state.phase === "running" || state.phase === "results"),
  );

  const showTable = Boolean(
    state.showTable && state.phase === "results" && state.reply,
  );

  // going back to routing should keep whatever is already picked
  const navigateHref = `/${writeUrl({
    from: start,
    to: target,
    mode: state.mode,
    race: state.race,
    algorithm: state.algorithm,
  })}`;

  if (buildings.isError) {
    return (
      <main className="shell">
        <div className="fatal">
          <h1 className="fatal-title">Cannot reach the routing service</h1>
          <p className="fatal-body">
            The service may be starting up or temporarily unavailable. Try again
            in a moment.
          </p>
          {/* only the person running it can use these, so visitors never see them */}
          {process.env.NODE_ENV === "development" ? (
            <p className="fatal-body">
              Not answering at <code>{API_BASE}</code>. Start it with{" "}
              <code>scripts/dev.ps1</code> and reload.
            </p>
          ) : null}
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
      <h1 className="sr-only">Algorithm lab</h1>
      <Header
        buildings={list}
        start={start}
        target={target}
        searchFor={state.searchFor}
        actionLabel={state.race ? "Race" : "Find route"}
        busy={state.phase === "running"}
        otherMode={{ href: navigateHref, label: "Back to routing" }}
        onOpenSearch={(which) => dispatch({ type: "openSearch", which })}
        onCloseSearch={() => dispatch({ type: "closeSearch" })}
        onPick={(which, b) => dispatch({ type: "pickBuilding", which, id: b.id })}
        onSwap={() => dispatch({ type: "swapEnds" })}
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
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      <div className="body">
        {showTable ? (
          <div className="map-wrap is-table" role="region" aria-label="route comparison">
            <ComparisonTable
              reply={state.reply as RouteReply}
              selected={state.selected}
              onClose={() => dispatch({ type: "toggleTable" })}
            />
          </div>
        ) : showGrid ? (
          <div
            className="map-wrap is-grid"
            role="region"
            aria-label="algorithm comparison"
          >
            <RaceGrid
              reply={state.reply as RouteReply}
              bounds={gridBounds as Bounds}
              playing={state.phase === "running"}
              startedAt={startedAt}
              reducedMotion={reducedMotion}
              selected={state.selected}
              onSelect={(algorithm) => dispatch({ type: "selectLane", algorithm })}
            />
            {/* the panels turn leaflet attribution off, so the credits live here */}
            <p className="grid-credit">
              <a href="https://www.maptiler.com/" target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MAPTILER_LOGO} alt="MapTiler" className="tile-logo" width={67} height={20} />
              </a>{" "}
              <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">
                © MapTiler
              </a>{" "}
              ·{" "}
              <a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">
                Leaflet
              </a>{" "}
              · Map data ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenStreetMap
              </a>{" "}
              contributors · All four share one frame
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
          <div
            className={`scrim${state.phase === "running" && state.reply ? " is-on" : ""}`}
            aria-hidden="true"
          />
          <div className="chip chip-weather" title="Current conditions from OpenWeather">
            {weatherChip}
          </div>
          {legend ? <div className="chip chip-legend">{legend}</div> : null}
        </div>
        )}

        <aside className={sheetClass}>
          <div className="sheet-handle" title="Drag to resize" {...handleProps}>
            <span />
          </div>

          <Sidebar
            state={state}
            progress={progress}
            canRun={canRun(state)}
            onPickAlgorithm={(algorithm) =>
              dispatch({ type: "pickAlgorithm", algorithm })
            }
            onToggleRace={() => dispatch({ type: "setRace", race: !state.race })}
            onRaceAll={raceAll}
            onSelectLane={(algorithm) => dispatch({ type: "selectLane", algorithm })}
            onRun={run}
            onReset={() => dispatch({ type: "reset" })}
            onSkip={skip}
            onReplay={replay}
            onToggleTable={() => dispatch({ type: "toggleTable" })}
            onMode={(mode) => dispatch({ type: "setMode", mode })}
          />
        </aside>
      </div>

    </main>
  );
}
