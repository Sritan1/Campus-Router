"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import Header from "@/components/Header";
import NavigatePanel from "@/components/NavigatePanel";
import ReachPanel from "@/components/ReachPanel";
import {
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
import { writeUrl } from "@/lib/url";

const MapPane = dynamic(() => import("@/components/MapPane"), {
  ssr: false,
  loading: () => <div className="map-pane map-loading">loading map…</div>,
});

const ALL = ["dijkstra", "astar", "bfs", "bidirectional"] as const;

export default function Navigate() {
  const { buildings, meta, list, weatherReady, weatherChip } = useCampus();

  const [start, setStart] = useState<Building | null>(null);
  const [target, setTarget] = useState<Building | null>(null);
  const [mode, setMode] = useState<RouteMode>("shortest");
  const [searchFor, setSearchFor] = useState<"start" | "target" | null>(null);
  const [reply, setReply] = useState<RouteReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the second thing navigate can do. no destination needed.
  const [view, setView] = useState<"route" | "reach">("route");
  const [minutes, setMinutes] = useState(5);
  const [reach, setReach] = useState<Isochrone | null>(null);

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

  // anything that changes the answer throws the old one away
  const clear = useCallback(() => {
    setReply(null);
    setReach(null);
    setError(null);
  }, []);

  const showReach = useCallback(async () => {
    if (!start) {
      setSearchFor("start");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // reach is always plain distance. measured across all 59 buildings,
      // the other two modes only shrink the area and almost never change
      // its shape, so offering them taught people the control was broken.
      setReach(await requestIsochrone({ start: start.id, mode: "shortest", minutes }));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not reach the routing service",
      );
      setReach(null);
    } finally {
      setBusy(false);
    }
  }, [start, minutes]);

  const run = useCallback(
    async (withMode: RouteMode = mode) => {
      if (!start || !target || start.id === target.id) {
        setSearchFor(start ? "target" : "start");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        // all four, but no traces. it costs about a millisecond and it
        // lets the link into the lab say something true.
        const result = await requestRoute({
          start: start.id,
          target: target.id,
          mode: withMode,
          algorithms: [...ALL],
          trace: false,
        });
        setReply(result);
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not reach the routing service",
        );
        setReply(null);
      } finally {
        setBusy(false);
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
          {/* the address and the command are only any use to whoever is
              running it, so a visitor never sees either */}
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
      <Header
        buildings={list}
        start={start}
        target={target}
        searchFor={searchFor}
        actionLabel="Find route"
        busy={busy}
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
            meta={null}
            playing={false}
            startedAt={null}
            reducedMotion={false}
            isochrone={view === "reach" ? reach : null}
          />
          <div className="chip chip-weather">{weatherChip}</div>
        </div>

        <aside className="sidebar">
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

          {/* the picker lives inside the route panel now. only the route
              uses a cost model, so reach never shows a dead control */}
          {view === "route" ? (
            <NavigatePanel
              reply={reply}
              start={start}
              target={target}
              mode={mode}
              weatherReady={weatherReady}
              busy={busy}
              error={error}
              ready={Boolean(start && target && !sameBuilding)}
              labHref={labHref}
              onRun={() => void run()}
              onMode={(next) => {
                if (next !== mode) {
                  setMode(next);
                  clear();
                }
              }}
            />
          ) : (
            <ReachPanel
              data={reach}
              start={start}
              minutes={minutes}
              busy={busy}
              error={error}
              ready={Boolean(start)}
              onMinutes={(next) => {
                setMinutes(next);
                setReach(null);
              }}
              onRun={() => void showReach()}
              onClear={() => setReach(null)}
            />
          )}
        </aside>
      </div>
    </main>
  );
}
