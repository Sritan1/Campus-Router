"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import type { AlgorithmResult } from "@/lib/api";
import { ALGORITHM_COLORS, LINE } from "@/lib/format";
import { PLAYBACK_MS, clamp, edgesShown } from "@/lib/playback";

type Props = {
  results: AlgorithmResult[];
  startedAt: number | null;
  reducedMotion: boolean;
  /// off draws nothing, playing animates, complete shows the whole search
  mode?: "off" | "playing" | "complete";
};

/// Draws the search spreading along the real footpaths.
///
/// Each settled node knows the node it was reached from, so a step is a
/// line down an actual path rather than a loose dot. That is what makes
/// bfs look like a flood and a star look like an arrow.
export default function TraceCanvas({
  results,
  startedAt,
  reducedMotion,
  mode = "playing",
}: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  // how far each algorithm has already been painted, so a frame only
  // strokes what is new instead of the whole search again
  const drawnRef = useRef<number[]>([]);

  // what the map looked like when we last painted. anything already on
  // the canvas was placed for that view and is wrong for any other.
  const viewRef = useRef<string>("");

  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "450";
    container.appendChild(canvas);
    canvasRef.current = canvas;

    return () => {
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    drawnRef.current = results.map(() => 0);

    function sizeToMap() {
      const size = map.getSize();
      const ratio = window.devicePixelRatio || 1;
      canvas!.width = size.x * ratio;
      canvas!.height = size.y * ratio;
      canvas!.style.width = `${size.x}px`;
      canvas!.style.height = `${size.y}px`;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      context!.lineCap = "round";
    }

    function wipe() {
      const size = map.getSize();
      context!.clearRect(0, 0, size.x, size.y);
      drawnRef.current = results.map(() => 0);
      viewRef.current = "";
    }

    /// Strokes one algorithm's paths between two positions in its trace.
    function strokeRange(result: AlgorithmResult, from: number, to: number) {
      const trace = result.trace;
      if (!trace?.edges.length || to <= from) {
        return;
      }

      context!.beginPath();
      for (let i = from; i < to; i++) {
        const edge = trace.edges[i];
        if (!edge) {
          continue;
        }
        const a = map.latLngToContainerPoint(trace.points[edge[0]]);
        const b = map.latLngToContainerPoint(trace.points[edge[1]]);
        context!.moveTo(a.x, a.y);
        context!.lineTo(b.x, b.y);
      }

      context!.strokeStyle = ALGORITHM_COLORS[result.algorithm] ?? "#2a78d6";
      // once it has played out the map comes back to full brightness, so
      // the search sits behind the route rather than competing with it
      context!.globalAlpha = mode === "complete" ? 0.45 : LINE.traceAlpha;
      context!.lineWidth = mode === "complete" ? LINE.trace * 0.8 : LINE.trace;
      context!.stroke();
      context!.globalAlpha = 1;
    }

    function progressNow() {
      if (mode === "complete") {
        return 1;
      }
      if (mode === "off" || startedAt === null) {
        return 0;
      }
      if (reducedMotion) {
        return 1;
      }
      return clamp((performance.now() - startedAt) / PLAYBACK_MS);
    }

    /// A short description of where the map is looking right now.
    function viewKey() {
      const at = map.getCenter();
      return `${map.getZoom()}:${at.lat.toFixed(6)}:${at.lng.toFixed(6)}`;
    }

    /// Paints whatever has been revealed since the last frame.
    function paintNew() {
      // if the map has shifted at all, everything already painted was
      // placed against a view that no longer exists. leaflet reports the
      // old zoom part way through its own animations, so this is checked
      // every frame rather than trusted to fire as an event.
      const now = viewKey();
      if (now !== viewRef.current) {
        viewRef.current = now;
        const size = map.getSize();
        context!.clearRect(0, 0, size.x, size.y);
        drawnRef.current = results.map(() => 0);
      }

      const progress = progressNow();
      results.forEach((result, index) => {
        const upTo = edgesShown(result, progress);
        const already = drawnRef.current[index] ?? 0;
        if (upTo > already) {
          strokeRange(result, already, upTo);
          drawnRef.current[index] = upTo;
        }
      });
    }

    /// Repaints everything, for when the map has moved under us.
    function repaintAll() {
      wipe();
      paintNew();
    }

    function loop() {
      paintNew();
      frameRef.current = requestAnimationFrame(loop);
    }

    function onResize() {
      sizeToMap();
      repaintAll();
    }

    sizeToMap();
    wipe();

    // panning or zooming invalidates every pixel already painted.
    // the end events matter as much as the live ones, because leaflet
    // only reports its real zoom once the animation has finished, and
    // whatever was painted before that is in the wrong place.
    map.on("move zoom moveend zoomend", repaintAll);
    map.on("resize", onResize);

    if (mode === "off") {
      // nothing to show, leave the canvas clear
    } else if (mode === "complete" || reducedMotion) {
      paintNew();
    } else if (startedAt !== null) {
      frameRef.current = requestAnimationFrame(loop);
    }

    return () => {
      map.off("move zoom moveend zoomend", repaintAll);
      // naming the handler matters, otherwise this takes leaflet's own
      // resize listener down with it
      map.off("resize", onResize);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      const size = map.getSize();
      context.clearRect(0, 0, size.x, size.y);
    };
  }, [map, results, startedAt, reducedMotion, mode]);

  return null;
}
