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

/// Draws the explored nodes on a canvas sitting over the map.
///
/// This has to be canvas. A bfs run settles thousands of nodes and four
/// of those as leaflet markers would be tens of thousands of dom nodes.
export default function TraceCanvas({ results, startedAt, reducedMotion }: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

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
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    function resize() {
      const size = map.getSize();
      const ratio = window.devicePixelRatio || 1;
      canvas!.width = size.x * ratio;
      canvas!.height = size.y * ratio;
      canvas!.style.width = `${size.x}px`;
      canvas!.style.height = `${size.y}px`;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw() {
      const size = map.getSize();
      context!.clearRect(0, 0, size.x, size.y);

      if (startedAt === null) {
        return;
      }

      const elapsed = performance.now() - startedAt;
      const progress = reducedMotion ? 1 : clamp(elapsed / PLAYBACK_MS);

      for (const result of results) {
        const points = result.trace?.points;
        if (!points?.length) {
          continue;
        }

        context!.fillStyle = ALGORITHM_COLORS[result.algorithm] ?? "#2a78d6";
        context!.globalAlpha = 0.35;

        const upTo = pointsShown(result, progress);
        for (let i = 0; i < upTo; i++) {
          const at = map.latLngToContainerPoint(points[i]);
          // skip anything scrolled off screen rather than drawing it
          if (at.x < -20 || at.y < -20 || at.x > size.x + 20 || at.y > size.y + 20) {
            continue;
          }
          context!.fillRect(at.x - 1.5, at.y - 1.5, 3, 3);
        }
      }
      context!.globalAlpha = 1;
    }

    function loop() {
      draw();
      frameRef.current = requestAnimationFrame(loop);
    }

    resize();
    // the map moving under a static canvas would smear the points
    map.on("move zoom resize", draw);
    map.on("resize", resize);

    if (startedAt === null || reducedMotion) {
      draw();
    } else {
      frameRef.current = requestAnimationFrame(loop);
    }

    return () => {
      map.off("move zoom resize", draw);
      map.off("resize", resize);
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
