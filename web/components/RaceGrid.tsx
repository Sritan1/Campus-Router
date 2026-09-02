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

  // the canvas takes a list, and a new array every render would make it
  // throw away what it has already painted
  const traces = useMemo(() => [result], [result]);

  return (
    <button
      type="button"
      className={`panel-map${result.algorithm === selected ? " is-active" : ""}`}
      onClick={() => onSelect(result.algorithm)}
      aria-label={`${ALGORITHM_LABELS[result.algorithm]} search`}
    >
      <MapContainer
        // every panel is pinned to the same frame, and none of them can
        // be moved. a panel framed on its own would make a small search
        // look like a closer zoom.
        bounds={bounds}
        boundsOptions={{ padding: [6, 6] }}
        // leaflet normally only sits on whole zoom levels, so a frame a
        // hair too big for one drops to the next and shows everything at
        // half the size. quarter steps let it actually fit the frame.
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
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* the tiles are beige and tan, which is close enough to the
            warmer trace colours that they break up against it. dimming
            while the search plays is what the big map already does. */}
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

      <span className="panel-label">
        <span className="panel-name">
          <span className="lane-swatch" style={{ background: colour }} />
          {ALGORITHM_LABELS[result.algorithm]}
        </span>
        <span className="panel-stat">
          {result.status === "ok"
            ? `${count(result.nodesVisited)} explored · ${distance(result.distanceM)}`
            : "no route"}
        </span>
      </span>
    </button>
  );
}

/// Four locked panels sharing one frame, for race mode only.
export default function RaceGrid(props: Props) {
  return (
    <div className="race-grid">
      {props.reply.results.map((result) => (
        <Panel key={result.algorithm} {...props} result={result} />
      ))}
    </div>
  );
}
