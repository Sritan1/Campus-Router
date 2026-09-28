"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import IsochroneCanvas from "@/components/IsochroneCanvas";
import TraceCanvas from "@/components/TraceCanvas";
import WatchMapSize from "@/components/WatchMapSize";
import type { AlgorithmResult, Building, GraphMeta, Isochrone, RouteReply } from "@/lib/api";
import { boundsAround, raceBounds } from "@/lib/bounds";
import { REGION_COLOUR } from "@/lib/isochrone";
import { NEW_TAB, TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from "@/lib/tiles";
import { ALGORITHM_COLORS, LINE, walkMinutes } from "@/lib/format";

const CAMPUS_CENTER: [number, number] = [41.8708, -87.6505];

// the graph and about a quarter more, kept by hand, so update it whenever the
// pipeline pulls a different area
const CAMPUS_MAX_BOUNDS: [[number, number], [number, number]] = [
  [41.8534, -87.6980],
  [41.8874, -87.6273],
];

// reachable buildings arrive nearest first, so only these keep a label
const LABELLED = 12;

type Props = {
  reply: RouteReply | null;
  selected: string;
  meta: GraphMeta | null;
  playing: boolean;
  startedAt: number | null;
  reducedMotion: boolean;
  isochrone?: Isochrone | null;
  // the building reach measures from, before anything is drawn
  reachStart?: Building | null;
};

function FitToRoute({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) {
      return;
    }
    // no animation. leaflet reports the old zoom while it animates, and the
    // trace canvas then draws in the wrong place
    map.fitBounds(points, { padding: [24, 24], maxZoom: 18, animate: false });
  }, [map, points]);

  return null;
}

// about a kilometre across, so the building has campus around it
const REACH_START_ZOOM = 16;

// not while an area is drawn, since that frames itself and the two would fight
function CenterOnStart({
  lat,
  lon,
  hasArea,
}: {
  lat: number;
  lon: number;
  hasArea: boolean;
}) {
  const map = useMap();
  const areaRef = useRef(hasArea);

  // a ref, not a dependency, so clearing an area does not move the map
  useEffect(() => {
    areaRef.current = hasArea;
  });

  useEffect(() => {
    if (areaRef.current || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    // never zooms out of a closer look somebody chose, and no animation, as above
    map.setView([lat, lon], Math.max(map.getZoom(), REACH_START_ZOOM), {
      animate: false,
    });
  }, [map, lat, lon]);

  return null;
}

// leaflet writes its own credit link, so give it a new tab like the others
function LeafletLinkInNewTab() {
  const map = useMap();

  useEffect(() => {
    const control = map.attributionControl;
    const prefix = control?.options.prefix;
    if (typeof prefix === "string" && !prefix.includes("_blank")) {
      control.setPrefix(prefix.replace("<a ", `<a ${NEW_TAB} `));
    }
  }, [map]);

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
  isochrone = null,
  reachStart = null,
}: Props) {
  // the same dot before and after the search, so a picked building shows at once
  const reachFrom = isochrone?.start ?? reachStart;
  // both feed memos below, and fresh ones every render made those miss each time
  const results = useMemo(() => drawableResults(reply), [reply]);
  const chosen = useMemo(
    () => results.find((r) => r.algorithm === selected) ?? results[0],
    [results, selected],
  );

  // the finished route would give the answer away while the search plays
  const showRoute = !playing;

  // the canvas keeps what it painted, so a fresh array would restart it
  const traces = useMemo(() => reply?.results ?? [], [reply]);

  // different paths draw faintly behind, so four lines do not stack up
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

  // a reach area frames on the ground it reached, a route on the race frame.
  // memoised, since a fresh array every render would fight the user panning
  const fitPoints = useMemo<[number, number][]>(() => {
    if (isochrone?.points.length) {
      // the drawn area sits outside its points, so pad the frame
      return boundsAround(isochrone.points, 0.12) ?? isochrone.points;
    }
    // the whole search, not 94 percent like the grid, since one map has room
    return raceBounds(reply, 1) ?? chosen?.points ?? [];
  }, [isochrone, reply, chosen]);

  return (
    <div className="map-pane">
      <MapContainer
        center={CAMPUS_CENTER}
        zoom={16}
        className="map-canvas"
        scrollWheelZoom
        // about twice the graph, so zooming out never shows city nothing routes across
        minZoom={13.5}
        // and it cannot be dragged off campus either
        maxBounds={CAMPUS_MAX_BOUNDS}
        maxBoundsViscosity={1}
        // on whole zoom levels a frame a hair too big drops to half the size
        zoomSnap={0.25}
        zoomDelta={0.25}
      >
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
          maxZoom={TILE_MAX_ZOOM}
        />

        <WatchMapSize />
        <LeafletLinkInNewTab />

        <TraceCanvas
          results={traces}
          startedAt={startedAt}
          reducedMotion={reducedMotion}
          mode={playing ? "playing" : results.length ? "complete" : "off"}
        />

        <IsochroneCanvas data={isochrone} />

        {/* the gateway leaves the start out of the reachable list, so draw it here */}
        {reachFrom ? (
          <CircleMarker
            center={[reachFrom.lat, reachFrom.lon]}
            radius={11}
            pathOptions={{
              color: "#ffffff",
              weight: 3.5,
              fillColor: REGION_COLOUR,
              fillOpacity: 1,
            }}
          >
            <Tooltip
              permanent
              direction="right"
              offset={[12, 0]}
              className="reach-tag is-start"
            >
              {reachFrom.abbr ?? reachFrom.name}
            </Tooltip>
            <Popup>
              <strong>{reachFrom.name}</strong>
              <br />
              {isochrone
                ? `Everywhere below is within ${isochrone.minutes} min`
                : "Search from here"}
            </Popup>
          </CircleMarker>
        ) : null}

        {/* reachable buildings, with a white ring to stay legible on the shaded area */}
        {isochrone?.buildings.map((building, rank) => (
          <CircleMarker
            key={building.id}
            center={[building.lat, building.lon]}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor: "#16181d",
              fillOpacity: 1,
            }}
          >
            {/* codes only, for the nearest few, or the labels pile up. a marker binds
                one tooltip, so the name goes in a popup */}
            {building.abbr && rank < LABELLED ? (
              <Tooltip permanent direction="right" offset={[9, 0]} className="reach-tag">
                {building.abbr}
              </Tooltip>
            ) : (
              <Tooltip direction="right" offset={[9, 0]} className="reach-tag">
                {building.abbr ?? building.name}
              </Tooltip>
            )}
            <Popup>
              <strong>{building.name}</strong>
              <br />
              {walkMinutes(building.seconds)} walk
            </Popup>
          </CircleMarker>
        ))}

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

        {reachStart ? (
          <CenterOnStart
            lat={reachStart.lat}
            lon={reachStart.lon}
            hasArea={Boolean(isochrone)}
          />
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
