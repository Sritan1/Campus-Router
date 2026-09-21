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
  // off draws nothing, playing animates, complete shows the whole search
  mode?: "off" | "playing" | "complete";
};

// draws the search as lines along real footpaths rather than loose dots,
// which is what makes bfs look like a flood and a star like an arrow
export default function TraceCanvas({
  results,
  startedAt,
  reducedMotion,
  mode = "playing",
}: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  // how far each algorithm is painted, so a frame only strokes what is new
  const drawnRef = useRef<number[]>([]);

  // the view last painted for, anything on the canvas is wrong for any other
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
      // once played out, the search sits behind the route instead of competing
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

    function viewKey() {
      const at = map.getCenter();
      return `${map.getZoom()}:${at.lat.toFixed(6)}:${at.lng.toFixed(6)}`;
    }

    function paintNew() {
      // checked every frame, not left to an event, since leaflet reports the old
      // zoom part way through its own animations
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

    // the end events too, since leaflet only reports the real zoom once it settles
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
      // name the handler, or this also removes the resize listener leaflet uses
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
