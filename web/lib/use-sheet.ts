"use client";

// the sidebar becomes a drag to resize sheet on phones. css cannot do snap
// points, so the height lives in --sb-h

import { useCallback, useEffect, useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";

// matches the sheet breakpoint in globals.css, so both flip at the same moment
const SHEET_QUERY = "(max-width: 599px), (max-width: 899px) and (min-height: 520px)";
const EASE = "height .28s cubic-bezier(.2,.8,.2,1)";

type Snaps = Record<Snap, number>;

// what a closed sheet shows and hides, for both the lab layout and the other
const CHROME = ".sheet-handle, .view-switch, .results-head, .panel-foot, .results-foot";
const SCROLLER = ".panel-scroll, .results-body";

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
  const snapRef = useRef<Snap>("half");
  snapRef.current = snap;

  const apply = useCallback(() => {
    if (!drag.current) {
      document.documentElement.style.setProperty("--sb-h", `${snapsNow()[snapRef.current]}px`);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(SHEET_QUERY);
    const sync = () => {
      setOn(mq.matches);
      if (mq.matches) {
        apply();
      } else {
        // a stale height would fight the next resize back down
        document.documentElement.style.removeProperty("--sb-h");
        document.documentElement.style.removeProperty("--sb-tr");
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
    const sheet = document.querySelector(".sidebar");
    if (!on || !sheet) {
      return;
    }
    const watch = new MutationObserver(() => apply());
    watch.observe(sheet, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [on, apply]);

  const detach = useRef<(() => void) | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!on) return;
      const sheet = e.currentTarget.parentElement;
      if (!sheet) return;
      detach.current?.();
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
    [on, apply],
  );

  useEffect(() => () => detach.current?.(), []);

  const onClick = useCallback(() => {
    if (!on || Date.now() - draggedAt.current < 300) return;
    setSnap((s) => (s === "full" ? "half" : "full"));
  }, [on]);

  return {
    sheetClass: on && snap === "peek" ? "sidebar is-peek" : "sidebar",
    handleProps: { onPointerDown, onClick },
  };
}
