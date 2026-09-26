"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import type { Bounds } from "@/lib/bounds";

// leaflet only watches the window. refit is for the locked race frames, which
// otherwise keep a stale zoom
export default function WatchMapSize({ refit }: { refit?: Bounds }) {
  const map = useMap();

  useEffect(() => {
    const box = map.getContainer();
    let frame = 0;
    // a drag fires this every frame, and neither call below is cheap
    const watch = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        if (refit) {
          map.fitBounds(refit, { padding: [6, 6], animate: false });
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
