"use client";

import { useEffect, useRef, useState } from "react";

import type { Building, Isochrone } from "@/lib/api";
import { walkMinutes } from "@/lib/format";

type Props = {
  data: Isochrone | null;
  start: Building | null;
  minutes: number;
  busy: boolean;
  error: string | null;
  ready: boolean;
  onMinutes: (minutes: number) => void;
  onRun: () => void;
  onClear: () => void;
};

// the campuses are about 25 minutes apart, so the top choice has to reach past that
const CHOICES = [5, 10, 20, 30];

// a floor, so a short window still shows a list worth reading
const LEAST_SHOWN = 4;

function Summary({
  start,
  minutes,
}: {
  start: Building | null;
  minutes: number;
}) {
  return (
    <div className="summary">
      <p className="section-label summary-head">Search from</p>
      <div className="summary-row">
        <span className="summary-key">
          <span className="summary-dot" aria-hidden="true" />
          Start
        </span>
        <span className="summary-value">
          {start ? start.abbr ?? start.name : "Not picked yet"}
        </span>
      </div>
      <div className="summary-row">
        <span className="summary-key">Budget</span>
        <span className="summary-value">{minutes} min walk</span>
      </div>
    </div>
  );
}

// measured, since a tall window fits twice what a short one does
function useRowsThatFit(
  box: React.RefObject<HTMLDivElement | null>,
  list: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  total: number,
) {
  const [fits, setFits] = useState(8);

  useEffect(() => {
    const outer = box.current;
    const inner = list.current;
    if (!outer || !inner || !enabled) {
      return;
    }

    function measure() {
      const row = inner!.querySelector(".reach-row") as HTMLElement | null;
      const height = row?.offsetHeight ?? 0;
      if (!height) {
        return;
      }
      // the heading and show more line share the room, so take them off first
      const head = inner!.querySelector(".reach-head") as HTMLElement | null;
      const more = inner!.querySelector(".reach-more") as HTMLElement | null;
      const taken = (head?.offsetHeight ?? 0) + (more?.offsetHeight ?? 40);

      // things above the list do not move, so this cannot fight itself
      const room = outer!.getBoundingClientRect().bottom - inner!.getBoundingClientRect().top;
      const many = Math.max(LEAST_SHOWN, Math.floor((room - taken - 10) / height));
      setFits((was) => (was === many ? was : many));
    }

    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(outer);
    return () => watch.disconnect();
  }, [box, list, enabled, total]);

  return fits;
}

export default function ReachPanel({
  data,
  start,
  minutes,
  busy,
  error,
  ready,
  onMinutes,
  onRun,
  onClear,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const drawn = Boolean(data) && !busy;
  const found = data?.buildings ?? [];

  const fits = useRowsThatFit(scrollRef, listRef, drawn && !expanded, found.length);
  const shown = expanded ? found : found.slice(0, fits);
  const hidden = found.length - shown.length;

  // a new search should not keep the old list open
  useEffect(() => {
    setExpanded(false);
  }, [data]);

  return (
    <div className="panel panel-stack">
      <div className="panel-scroll" ref={scrollRef}>
        <h2 className="panel-title">How far can I get?</h2>
        <p className="lede">
          Everywhere you can reach on foot from your start.
        </p>

        <div className="segmented" role="group" aria-label="walking time">
          {CHOICES.map((choice) => (
            <button
              type="button"
              key={choice}
              className={minutes === choice ? "is-active" : ""}
              aria-pressed={minutes === choice}
              onClick={() => onMinutes(choice)}
            >
              {choice} min
            </button>
          ))}
        </div>

        {error ? (
          <>
            <p className="section-label">Something went wrong</p>
            <p className="empty-body">{error}</p>
          </>
        ) : null}

        {drawn && found.length > 0 ? (
          <div className="reach-list" ref={listRef}>
            <p className="section-label reach-head">
              Buildings in reach
              <span className="reach-count">{found.length}</span>
            </p>
            {shown.map((building) => (
              <span className="reach-row" key={building.id}>
                <span className="reach-code">{building.abbr ?? "—"}</span>
                <span className="reach-name">{building.name}</span>
                <span className="reach-time">{walkMinutes(building.seconds)}</span>
              </span>
            ))}
            {hidden > 0 || expanded ? (
              <button
                type="button"
                className="reach-more"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
              >
                {expanded ? "Show fewer" : `Show ${hidden} more`}
              </button>
            ) : null}
          </div>
        ) : null}

        {drawn && found.length === 0 ? (
          <p className="empty-body">
            No other buildings reachable in {minutes} min.
          </p>
        ) : null}

        {!drawn ? <Summary start={start} minutes={minutes} /> : null}
      </div>

      <div className="panel-foot">
        {drawn ? (
          <button type="button" className="secondary" onClick={onClear}>
            Clear reach
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onRun}
            disabled={!ready || busy}
          >
            {busy ? "Working…" : "Show reach"}
          </button>
        )}
        {!ready && !drawn ? (
          <p className="panel-hint centered">Pick a start building</p>
        ) : null}
      </div>
    </div>
  );
}
