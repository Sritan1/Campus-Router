"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import type { Isochrone } from "@/lib/api";
import { REGION_COLOUR, grow, outlines, simplify } from "@/lib/isochrone";

type Props = {
  data: Isochrone | null;
};

// small enough to follow the shape, big enough that neighbouring paths join.
// squares grow by one, so the outline can sit this far outside the real edge
const CELL_M = 55;

// only squares the search reached join the area, so unlike a hull it cannot
// bulge across the expressway
export default function IsochroneCanvas({ data }: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "440";
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

    function sizeToMap() {
      const size = map.getSize();
      const r = window.devicePixelRatio || 1;
      canvas!.width = size.x * r;
      canvas!.height = size.y * r;
      canvas!.style.width = `${size.x}px`;
      canvas!.style.height = `${size.y}px`;
      context!.setTransform(r, 0, 0, r, 0, 0);
    }

    function pixelsFor(metres: number) {
      const centre = map.getCenter();
      const here = map.latLngToContainerPoint(centre);
      const north = map.latLngToContainerPoint([
        centre.lat + metres / 111320,
        centre.lng,
      ]);
      return Math.abs(north.y - here.y);
    }

    function draw() {
      const size = map.getSize();
      context!.clearRect(0, 0, size.x, size.y);
      if (!data || data.edges.length === 0) {
        return;
      }

      const cell = Math.max(10, Math.min(pixelsFor(CELL_M), 120));

      const cells = new Set<string>();
      for (const edge of data.edges) {
        for (const end of edge) {
          const at = map.latLngToContainerPoint(data.points[end]);
          cells.add(`${Math.floor(at.x / cell)}:${Math.floor(at.y / cell)}`);
        }
      }

      // a piece this small is a stray path, not an area worth outlining
      const rings = outlines(grow(cells)).filter((ring) => ring.length >= 8);
      if (rings.length === 0) {
        return;
      }

      context!.beginPath();
      for (const ring of rings) {
        const shape = simplify(ring);
        context!.moveTo(shape[0][0] * cell, shape[0][1] * cell);
        for (let i = 1; i < shape.length; i++) {
          context!.lineTo(shape[i][0] * cell, shape[i][1] * cell);
        }
        context!.closePath();
      }

      context!.fillStyle = REGION_COLOUR;
      context!.globalAlpha = 0.1;
      context!.fill();

      // mitre, not round. the corners are the whole point of the shape.
      context!.strokeStyle = REGION_COLOUR;
      context!.globalAlpha = 0.85;
      context!.lineWidth = 1.8;
      context!.lineJoin = "miter";
      context!.miterLimit = 6;
      context!.stroke();
      context!.globalAlpha = 1;
    }

    function onResize() {
      sizeToMap();
      draw();
    }

    sizeToMap();
    draw();
    map.on("move zoom moveend zoomend", draw);
    map.on("resize", onResize);

    return () => {
      map.off("move zoom moveend zoomend", draw);
      map.off("resize", onResize);
      const size = map.getSize();
      context.clearRect(0, 0, size.x, size.y);
    };
  }, [map, data]);

  return null;
}
