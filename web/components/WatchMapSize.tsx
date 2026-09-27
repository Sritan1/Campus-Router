"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import type { Bounds } from "@/lib/bounds";

// leaflet only watches the window. refit is for the locked race frames
export default function WatchMapSize({ refit }: { refit?: Bounds }) {
  const map = useMap();

  useEffect(() => {
    const box = map.getContainer();
    let frame = 0;
    // a drag fires this every frame
    const watch = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        // animated, or leaflet fetches every tile again
        if (refit) {
          map.fitBounds(refit, { padding: [6, 6], animate: true });
        }
      });
    });
    watch.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, [map, refit]);

  return null;
}
