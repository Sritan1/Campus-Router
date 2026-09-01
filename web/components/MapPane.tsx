"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import TraceCanvas from "@/components/TraceCanvas";
import type { AlgorithmResult, GraphMeta, RouteReply } from "@/lib/api";
import { ALGORITHM_COLORS, LINE } from "@/lib/format";

const CAMPUS_CENTER: [number, number] = [41.8708, -87.6505];

type Props = {
  reply: RouteReply | null;
  selected: string;
  meta: GraphMeta | null;
  playing: boolean;
  startedAt: number | null;
  reducedMotion: boolean;
};

/// Keeps the whole route on screen when a new one arrives.
function FitToRoute({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) {
      return;
    }
    map.fitBounds(points, { padding: [60, 60], maxZoom: 18 });
  }, [map, points]);

  return null;
}

function drawableResults(reply: RouteReply | null): AlgorithmResult[] {
  if (!reply) {
    return [];
  }
  return reply.results.filter((r) => r.status === "ok" && r.points?.length);
}

export default function MapPane({
  reply,
  selected,
  meta,
  playing,
  startedAt,
  reducedMotion,
}: Props) {
  const results = drawableResults(reply);
  const chosen = results.find((r) => r.algorithm === selected) ?? results[0];

  // while the exploration plays, the finished route would give the
  // answer away, so the lines wait until it is done
  const showRoute = !playing;

  // anything that took a different path is drawn faintly behind, so the
  // race shows without four lines stacking on the same pixels
  const others = useMemo(() => {
    if (!chosen?.points) {
      return [];
    }
    const chosenKey = JSON.stringify(chosen.points);
    const seen = new Set<string>([chosenKey]);
    const unique: AlgorithmResult[] = [];
    for (const result of results) {
      const key = JSON.stringify(result.points);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(result);
      }
    }
    return unique;
  }, [results, chosen]);

  const fitPoints = chosen?.points ?? [];

  return (
    <div className="map-pane">
      <MapContainer
        center={CAMPUS_CENTER}
        zoom={16}
        className="map-canvas"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <TraceCanvas
          results={reply?.results ?? []}
          startedAt={playing ? startedAt : null}
          reducedMotion={reducedMotion}
        />

        {showRoute
          ? others.map((result) => (
              <Polyline
                key={`alt-${result.algorithm}`}
                positions={result.points ?? []}
                pathOptions={{
                  color: "#9aa0a6",
                  weight: LINE.alternate,
                  opacity: 0.75,
                  dashArray: "10 8",
                }}
              />
            ))
          : null}

        {showRoute && chosen?.points ? (
          <Polyline
            positions={chosen.points}
            pathOptions={{
              color: ALGORITHM_COLORS[chosen.algorithm] ?? "#2a78d6",
              weight: LINE.route,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ) : null}

        {showRoute && chosen?.points?.length ? (
          <>
            <CircleMarker
              center={chosen.points[0]}
              radius={9}
              pathOptions={{ color: "#1a1a1a", fillColor: "#1a1a1a", fillOpacity: 1 }}
            />
            <CircleMarker
              center={chosen.points[chosen.points.length - 1]}
              radius={9}
              pathOptions={{ color: "#2a78d6", fillColor: "#2a78d6", fillOpacity: 1 }}
            />
          </>
        ) : null}

        <FitToRoute points={fitPoints} />
      </MapContainer>

      {meta ? (
        <div className="chip chip-stats">
          footway graph — {meta.counts.nodes.toLocaleString("en-US")} nodes /{" "}
          {meta.counts.edges.toLocaleString("en-US")} edges
        </div>
      ) : null}
    </div>
  );
}
