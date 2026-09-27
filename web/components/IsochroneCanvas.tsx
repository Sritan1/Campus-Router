"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import type { Isochrone } from "@/lib/api";
import { REGION_COLOUR, grow, outlines, simplify, type Ring } from "@/lib/isochrone";
import { paneCanvas, pinToCorner } from "@/lib/map-canvas";

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
    const canvas = paneCanvas(map);
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

    function cellPixels(area: Isochrone, zoom: number) {
      const lat = area.points[0][0];
      const here = map.project([lat, 0], zoom);
      const north = map.project([lat + CELL_M / 111320, 0], zoom);
      return Math.max(10, Math.min(Math.abs(north.y - here.y), 120));
    }

    // world pixels, so panning does not reshape it
    let shape: { zoom: number; cell: number; rings: Ring[] } | null = null;

    function shapeAt(area: Isochrone, zoom: number) {
      if (shape && shape.zoom === zoom) {
        return shape;
      }
      const cell = cellPixels(area, zoom);
      const cells = new Set<string>();
      for (const edge of area.edges) {
        for (const end of edge) {
          const at = map.project(area.points[end], zoom);
          cells.add(`${Math.floor(at.x / cell)}:${Math.floor(at.y / cell)}`);
        }
      }

      // a piece this small is a stray path, not an area worth outlining
      const rings = outlines(grow(cells))
        .filter((ring) => ring.length >= 8)
        .map((ring) => simplify(ring));
      shape = { zoom, cell, rings };
      return shape;
    }

    function draw() {
      pinToCorner(map, canvas!);
      const size = map.getSize();
      context!.clearRect(0, 0, size.x, size.y);
      if (!data || data.edges.length === 0) {
        return;
      }

      const zoom = map.getZoom();
      const { cell, rings } = shapeAt(data, zoom);
      if (rings.length === 0) {
        return;
      }
      const corner = map.project(map.containerPointToLatLng([0, 0]), zoom);

      context!.beginPath();
      for (const ring of rings) {
        context!.moveTo(ring[0][0] * cell - corner.x, ring[0][1] * cell - corner.y);
        for (let i = 1; i < ring.length; i++) {
          context!.lineTo(ring[i][0] * cell - corner.x, ring[i][1] * cell - corner.y);
        }
        context!.closePath();
      }

      context!.fillStyle = REGION_COLOUR;
      context!.globalAlpha = 0.1;
      context!.fill();

      // mitre, not round. the corners are the whole point of the shape
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
