"use client";

// the sidebar becomes a drag to resize sheet on phones. css cannot do snap
// points, so the height lives in --sb-h

import { useCallback, useEffect, useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";

// matches the sheet breakpoint in globals.css, so both flip at the same moment
const SHEET_QUERY = "(max-width: 599px), (max-width: 899px) and (min-height: 520px)";
const EASE = "height .28s cubic-bezier(.2,.8,.2,1)";

type Snaps = Record<Snap, number>;

// a little over the snap animation
const LAND_MS = 320;

// the map keeps its size while the sheet moves over it
function holdMap() {
  const root = document.documentElement;
  const wrap = document.querySelector<HTMLElement>(".map-wrap");
  if (!wrap || root.classList.contains("sheet-moving")) {
    return;
  }
  root.style.setProperty("--map-held", `${wrap.getBoundingClientRect().height}px`);
  root.classList.add("sheet-moving");
}

function releaseMap() {
  document.documentElement.classList.remove("sheet-moving");
  document.documentElement.style.removeProperty("--map-held");
}

// what a closed sheet shows and hides, for all three layouts
const CHROME =
  ".sheet-handle, .view-switch, .results-head, .panel-foot, .results-foot, .panel-running > .panel-title";
const SCROLLER = ".panel-scroll, .results-body, .running-body";

function peekNow(): number {
  const sheet = document.querySelector<HTMLElement>(".sidebar");
  if (!sheet) {
    return 150;
  }
  let total = sheet.offsetHeight - sheet.clientHeight;
  sheet.querySelectorAll(CHROME).forEach((el) => {
    total += el.getBoundingClientRect().height;
  });
  return Math.round(total);
}

// off the row, not the window, which mobile browsers report inconsistently
function snapsNow(): Snaps {
  const row = document.querySelector(".body");
  const bodyH = row ? row.getBoundingClientRect().height : 0;
  const full = Math.max(200, bodyH - 170);
  const half = Math.min(full, Math.round(bodyH * 0.46));
  // a panel that is only a short message has nothing to close down to
  const sheet = document.querySelector(".sidebar");
  const closable = Boolean(sheet?.querySelector(SCROLLER));
  const peek = closable ? Math.min(peekNow(), half) : half;
  return { peek, half, full };
}

export function useSheet() {
  const [snap, setSnap] = useState<Snap>("half");
  const [on, setOn] = useState(false);
  const drag = useRef<{
    y: number;
    h: number;
    cur: number;
    moved: boolean;
    snaps: Snaps;
  } | null>(null);
  const draggedAt = useRef(0);
  const landing = useRef(0);
  const snapRef = useRef<Snap>("half");
  snapRef.current = snap;

  const apply = useCallback(() => {
    // nothing to measure behind the fatal screen
    if (drag.current || !document.querySelector(".body")) {
      return;
    }
    document.documentElement.style.setProperty("--sb-h", `${snapsNow()[snapRef.current]}px`);
  }, []);

  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const handleRef = useCallback((handle: HTMLDivElement | null) => {
    setSheet(handle?.parentElement ?? null);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(SHEET_QUERY);
    const sync = () => {
      setOn(mq.matches);
      if (mq.matches) {
        apply();
      } else {
        detach.current?.();
        drag.current = null;
        // a stale height would fight the next resize back down
        document.documentElement.style.removeProperty("--sb-h");
        document.documentElement.style.removeProperty("--sb-tr");
        releaseMap();
      }
    };
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [apply]);

  useEffect(() => {
    if (on) {
      apply();
    }
  }, [on, snap, apply]);

  // the lab swaps its panel mid race, and a closed sheet clips the new footer
  useEffect(() => {
    if (!on || !sheet) {
      return;
    }
    apply();
    const watch = new MutationObserver(() => {
      // closed during a run, it keeps its height
      if (snapRef.current === "peek" && sheet.querySelector(".panel-running")) {
        return;
      }
      apply();
    });
    watch.observe(sheet, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [on, sheet, apply]);

  const detach = useRef<(() => void) | null>(null);

  const releaseSoon = useCallback(() => {
    window.clearTimeout(landing.current);
    landing.current = window.setTimeout(releaseMap, LAND_MS);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!on) return;
      const sheet = e.currentTarget.parentElement;
      if (!sheet) return;
      detach.current?.();
      window.clearTimeout(landing.current);
      holdMap();
      // read once, or the floor chases the shrinking sheet down
      drag.current = {
        y: e.clientY,
        h: sheet.getBoundingClientRect().height,
        cur: 0,
        moved: false,
        snaps: snapsNow(),
      };
      document.documentElement.style.setProperty("--sb-tr", "none");

      const up = () => {
        detach.current?.();
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        document.documentElement.style.setProperty("--sb-tr", EASE);
        releaseSoon();
        if (!d.moved) {
          apply();
          return;
        }
        draggedAt.current = Date.now();
        const s = d.snaps;
        const keys: Snap[] = ["peek", "half", "full"];
        const nearest = keys.reduce((best, k) =>
          Math.abs(s[k] - d.cur) < Math.abs(s[best] - d.cur) ? k : best,
        );
        if (nearest === snapRef.current) apply();
        else setSnap(nearest);
      };

      const move = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        // a release can go missing, and the sheet would trail a loose cursor
        if (ev.buttons === 0) {
          up();
          return;
        }
        const dy = ev.clientY - d.y;
        if (Math.abs(dy) > 5) d.moved = true;
        d.cur = Math.max(d.snaps.peek, Math.min(d.snaps.full, d.h - dy));
        document.documentElement.style.setProperty("--sb-h", `${d.cur}px`);
      };

      // on the window, since at a limit the handle stops following the pointer
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      window.addEventListener("blur", up);
      detach.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        window.removeEventListener("blur", up);
        detach.current = null;
      };
    },
    [on, apply, releaseSoon],
  );

  useEffect(
    () => () => {
      detach.current?.();
      window.clearTimeout(landing.current);
      releaseMap();
    },
    [],
  );

  const onClick = useCallback(() => {
    if (!on || Date.now() - draggedAt.current < 300) return;
    holdMap();
    releaseSoon();
    setSnap((s) => (s === "full" ? "half" : "full"));
  }, [on, releaseSoon]);

  return {
    sheetClass: on && snap === "peek" ? "sidebar is-peek" : "sidebar",
    handleProps: { ref: handleRef, onPointerDown, onClick },
  };
}
