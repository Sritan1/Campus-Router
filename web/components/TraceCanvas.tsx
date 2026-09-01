"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import type { AlgorithmResult } from "@/lib/api";
import { ALGORITHM_COLORS } from "@/lib/format";
import { PLAYBACK_MS, clamp, pointsShown } from "@/lib/playback";

type Props = {
  results: AlgorithmResult[];
  startedAt: number | null;
  reducedMotion: boolean;
};

/// Draws the search spreading along the real footpaths.
///
/// Each settled node knows the node it was reached from, so a step is a
/// line down an actual path rather than a loose dot. That is what makes
/// bfs look like a flood and a star look like an arrow.
export default function TraceCanvas({ results, startedAt, reducedMotion }: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  // how far each algorithm has already been painted, so a frame only
  // strokes what is new instead of the whole search again
  const drawnRef = useRef<number[]>([]);

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
    }

    /// Strokes one algorithm's segments between two positions in its trace.
    function strokeRange(result: AlgorithmResult, from: number, to: number) {
      const trace = result.trace;
      if (!trace?.points.length || to <= from) {
        return;
      }

      context!.beginPath();
      for (let i = from; i < to; i++) {
        const parent = trace.parents[i];
        if (parent === undefined || parent < 0) {
          continue;
        }
        const a = map.latLngToContainerPoint(trace.points[parent]);
        const b = map.latLngToContainerPoint(trace.points[i]);
        context!.moveTo(a.x, a.y);
        context!.lineTo(b.x, b.y);
      }

      context!.strokeStyle = ALGORITHM_COLORS[result.algorithm] ?? "#2a78d6";
      context!.globalAlpha = 0.55;
      context!.lineWidth = 1.6;
      context!.stroke();
      context!.globalAlpha = 1;
    }

    function progressNow() {
      if (startedAt === null) {
        return 0;
      }
      if (reducedMotion) {
        return 1;
      }
      return clamp((performance.now() - startedAt) / PLAYBACK_MS);
    }

    /// Paints whatever has been revealed since the last frame.
    function paintNew() {
      const progress = progressNow();
      results.forEach((result, index) => {
        const upTo = pointsShown(result, progress);
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

    sizeToMap();
    wipe();

    // panning or zooming invalidates every pixel already painted
    map.on("move zoom", repaintAll);
    map.on("resize", () => {
      sizeToMap();
      repaintAll();
    });

    if (startedAt === null) {
      // nothing playing, leave the canvas clear
    } else if (reducedMotion) {
      paintNew();
    } else {
      frameRef.current = requestAnimationFrame(loop);
    }

    return () => {
      map.off("move zoom", repaintAll);
      map.off("resize");
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      const size = map.getSize();
      context.clearRect(0, 0, size.x, size.y);
    };
  }, [map, results, startedAt, reducedMotion]);

  return null;
}
