"use client";

import { useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import TraceCanvas from "@/components/TraceCanvas";
import type { AlgorithmResult, RouteReply } from "@/lib/api";
import type { Bounds } from "@/lib/bounds";
import {
  ALGORITHM_COLORS,
  ALGORITHM_LABELS,
  LINE,
  count,
  distance,
} from "@/lib/format";
import { TILE_MAX_ZOOM, TILE_URL } from "@/lib/tiles";

type Props = {
  reply: RouteReply;
  bounds: Bounds;
  playing: boolean;
  startedAt: number | null;
  reducedMotion: boolean;
  selected: string;
  onSelect: (algorithm: AlgorithmResult["algorithm"]) => void;
};

type PanelProps = Omit<Props, "reply"> & { result: AlgorithmResult };

function Panel({
  result,
  bounds,
  playing,
  startedAt,
  reducedMotion,
  selected,
  onSelect,
}: PanelProps) {
  const colour = ALGORITHM_COLORS[result.algorithm] ?? "#2a78d6";
  const points = result.points ?? [];

  // a new array every render would make the canvas drop what it painted
  const traces = useMemo(() => [result], [result]);

  return (
    // a div, since a button cannot validly hold a whole leaflet map
    <div
      role="button"
      tabIndex={0}
      aria-pressed={result.algorithm === selected}
      className={`panel-map${result.algorithm === selected ? " is-active" : ""}`}
      onClick={() => onSelect(result.algorithm)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(result.algorithm);
        }
      }}
      aria-label={`${ALGORITHM_LABELS[result.algorithm]} search`}
    >
      <span className="panel-label">
        <span className="panel-name">
          <span className="lane-swatch" style={{ background: colour }} />
          {ALGORITHM_LABELS[result.algorithm]}
        </span>
        <span className="panel-stat">
          {result.status === "ok"
            ? `${count(result.nodesVisited)} explored · ${distance(result.distanceM)}`
            : "No route"}
        </span>
      </span>

      <span className="panel-frame">
      <MapContainer
        // all panels share one locked frame, or a small search looks like a closer zoom
        bounds={bounds}
        boundsOptions={{ padding: [6, 6] }}
        // quarter zoom steps, for the same reason as the main map
        zoomSnap={0.25}
        zoomDelta={0.25}
        className="panel-canvas"
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={TILE_URL} maxZoom={TILE_MAX_ZOOM} />

        {/* dimmed while playing, since the beige tiles break up the warmer traces */}
        <div
          className={`scrim${playing ? " is-on" : ""}`}
          aria-hidden="true"
        />

        <TraceCanvas
          results={traces}
          startedAt={startedAt}
          reducedMotion={reducedMotion}
          mode={playing ? "playing" : "complete"}
        />

        {!playing && points.length ? (
          <>
            <Polyline
              positions={points}
              pathOptions={{
                color: colour,
                weight: LINE.route * 0.6,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <CircleMarker
              center={points[0]}
              radius={5}
              pathOptions={{ color: "#1a1a1a", fillColor: "#1a1a1a", fillOpacity: 1 }}
            />
            <CircleMarker
              center={points[points.length - 1]}
              radius={5}
              pathOptions={{ color: "#2a78d6", fillColor: "#2a78d6", fillOpacity: 1 }}
            />
          </>
        ) : null}
      </MapContainer>
      </span>
    </div>
  );
}

// race mode only
export default function RaceGrid(props: Props) {
  return (
    <div className="race-grid">
      {props.reply.results.map((result) => (
        <Panel key={result.algorithm} {...props} result={result} />
      ))}
    </div>
  );
}
