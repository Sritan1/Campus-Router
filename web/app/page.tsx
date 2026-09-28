"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

import Header from "@/components/Header";
import NavigatePanel from "@/components/NavigatePanel";
import ReachPanel from "@/components/ReachPanel";
import {
  ALGORITHMS,
  API_BASE,
  ApiError,
  requestIsochrone,
  requestRoute,
  type Building,
  type Isochrone,
  type RouteMode,
  type RouteReply,
} from "@/lib/api";
import { useCampus, useRestoreFromUrl, useWriteUrl } from "@/lib/use-campus";
import { useSheet } from "@/lib/use-sheet";
import { writeUrl } from "@/lib/url";

const MapPane = dynamic(() => import("@/components/MapPane"), {
  ssr: false,
  loading: () => <div className="map-pane map-loading">Loading the map…</div>,
});


export default function Navigate() {
  const { buildings, list, weatherReady, weatherChip } = useCampus();
  const { sheetClass, handleProps } = useSheet();

  const [start, setStart] = useState<Building | null>(null);
  const [target, setTarget] = useState<Building | null>(null);
  const [mode, setMode] = useState<RouteMode>("shortest");
  const [searchFor, setSearchFor] = useState<"start" | "target" | null>(null);
  const [reply, setReply] = useState<RouteReply | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [view, setView] = useState<"route" | "reach">("route");
  const [minutes, setMinutes] = useState(5);
  const [reach, setReach] = useState<Isochrone | null>(null);
  const [reachBusy, setReachBusy] = useState(false);
  const [reachError, setReachError] = useState<string | null>(null);

  // bumped when the question changes, so late answers are dropped
  const routeTicket = useRef(0);
  const reachTicket = useRef(0);

  const { notice, setNotice, restored } = useRestoreFromUrl(list, (found) => {
    setStart(found.start);
    setTarget(found.target);
    if (found.wanted.mode) {
      setMode(found.wanted.mode);
    }
  });

  useWriteUrl(restored.current, {
    from: start,
    to: target,
    mode,
    race: true,
    algorithm: "astar",
  });

  const dropReach = useCallback(() => {
    reachTicket.current++;
    setReach(null);
    setReachBusy(false);
    setReachError(null);
  }, []);

  const clear = useCallback(() => {
    routeTicket.current++;
    setReply(null);
    setRouteBusy(false);
    setRouteError(null);
    dropReach();
  }, [dropReach]);

  const showReach = useCallback(async () => {
    if (!start) {
      setSearchFor("start");
      return;
    }
    const ticket = ++reachTicket.current;
    setReachBusy(true);
    setReachError(null);
    try {
      // always plain distance, the other modes barely changed the shape
      const found = await requestIsochrone({ start: start.id, mode: "shortest", minutes });
      if (ticket === reachTicket.current) {
        setReach(found);
      }
    } catch (caught) {
      if (ticket === reachTicket.current) {
        setReachError(
          caught instanceof ApiError
            ? caught.message
            : "We could not reach the routing service. Try again in a moment.",
        );
        setReach(null);
      }
    } finally {
      if (ticket === reachTicket.current) {
        setReachBusy(false);
      }
    }
  }, [start, minutes]);

  const run = useCallback(
    async (withMode: RouteMode = mode) => {
      if (!start || !target || start.id === target.id) {
        setSearchFor(start ? "target" : "start");
        return;
      }

      const ticket = ++routeTicket.current;
      setRouteBusy(true);
      setRouteError(null);
      try {
        // all four without traces, nearly free, so the lab invite can say something true
        const result = await requestRoute({
          start: start.id,
          target: target.id,
          mode: withMode,
          algorithms: [...ALGORITHMS],
          trace: false,
        });
        if (ticket === routeTicket.current) {
          setReply(result);
        }
      } catch (caught) {
        if (ticket === routeTicket.current) {
          setRouteError(
            caught instanceof ApiError
              ? caught.message
              : "We could not reach the routing service. Try again in a moment.",
          );
          setReply(null);
        }
      } finally {
        if (ticket === routeTicket.current) {
          setRouteBusy(false);
        }
      }
    },
    [start, target, mode],
  );

  const labHref = `/lab${writeUrl({
    from: start,
    to: target,
    mode,
    race: true,
    algorithm: "astar",
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
          <button type="button" className="primary" onClick={() => buildings.refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const sameBuilding = Boolean(start && target && start.id === target.id);

  return (
    <main className="shell">
      <h1 className="sr-only">Campus Router</h1>
      <Header
        buildings={list}
        start={start}
        target={target}
        searchFor={searchFor}
        actionLabel="Find route"
        busy={routeBusy}
        otherMode={{ href: labHref, label: "Algorithm lab" }}
        onOpenSearch={setSearchFor}
        onCloseSearch={() => setSearchFor(null)}
        onPick={(which, building) => {
          if (which === "start") {
            setStart(building);
          } else {
            setTarget(building);
          }
          setSearchFor(null);
          clear();
        }}
        onSwap={() => {
          setStart(target);
          setTarget(start);
          clear();
        }}
        onRun={() => void run()}
      />

      {notice || sameBuilding ? (
        <div className="notice" role="status">
          {sameBuilding
            ? "Start and destination are the same building."
            : notice}
          {notice && !sameBuilding ? (
            <button type="button" className="link-button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="body">
        <div className="map-wrap" role="region" aria-label="campus map">
          <MapPane
            reply={view === "route" ? reply : null}
            selected={reply?.results.find((r) => r.status === "ok")?.algorithm ?? "astar"}
            // no graph stats here, node counts are for the lab
            meta={null}
            playing={false}
            startedAt={null}
            reducedMotion={false}
            isochrone={view === "reach" ? reach : null}
            reachStart={view === "reach" ? start : null}
          />
          <div className="chip chip-weather" title="Current conditions from OpenWeather">
            {weatherChip}
          </div>
        </div>

        <aside className={sheetClass}>
          <div className="sheet-handle" title="Drag to resize" {...handleProps}>
            <span />
          </div>

          <div className="view-switch" role="group" aria-label="what to show">
            <button
              type="button"
              className={view === "route" ? "is-active" : ""}
              aria-pressed={view === "route"}
              onClick={() => setView("route")}
            >
              Route
            </button>
            <button
              type="button"
              className={view === "reach" ? "is-active" : ""}
              aria-pressed={view === "reach"}
              onClick={() => setView("reach")}
            >
              Reach
            </button>
          </div>

          {/* only the route uses a cost model, so reach never shows a dead control */}
          {view === "route" ? (
            <NavigatePanel
              reply={reply}
              start={start}
              target={target}
              mode={mode}
              weatherReady={weatherReady}
              busy={routeBusy}
              error={routeError}
              ready={Boolean(start && target && !sameBuilding)}
              labHref={labHref}
              onRun={() => void run()}
              onClear={() => setReply(null)}
              onMode={(next) => {
                if (next === mode) {
                  return;
                }
                setMode(next);
                // a route on screen answers the old mode, so ask again. clearing it
                // hid what accessible actually changed
                if (reply) {
                  void run(next);
                } else {
                  clear();
                }
              }}
            />
          ) : (
            <ReachPanel
              data={reach}
              start={start}
              minutes={minutes}
              busy={reachBusy}
              error={reachError}
              ready={Boolean(start)}
              onMinutes={(next) => {
                setMinutes(next);
                dropReach();
              }}
              onRun={() => void showReach()}
              onClear={dropReach}
            />
          )}
        </aside>
      </div>
    </main>
  );
}
