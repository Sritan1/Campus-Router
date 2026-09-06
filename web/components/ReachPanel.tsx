"use client";

import { useEffect, useRef, useState } from "react";

import type { Building, Isochrone } from "@/lib/api";

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

const CHOICES = [3, 5, 10, 15];

// never collapse below this, otherwise a short window leaves a list too
// stubby to be worth reading
const LEAST_SHOWN = 4;

/// What the search is about to do, before it has done it.
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

/// How many rows the panel can show without scrolling.
///
/// Measured rather than guessed, because a tall window fits twice what
/// a short one does and a fixed number is wrong on both.
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
      // the heading and the show more line live in here too, so their
      // height comes off before the rows are counted
      const head = inner!.querySelector(".reach-head") as HTMLElement | null;
      const more = inner!.querySelector(".reach-more") as HTMLElement | null;
      const taken = (head?.offsetHeight ?? 0) + (more?.offsetHeight ?? 40);

      // space left under wherever the list starts. the things above it
      // do not move, so this does not fight itself.
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

        {error ? <p className="empty-body">{error}</p> : null}

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
                <span className="reach-time">
                  {Math.max(1, Math.round(building.seconds / 60))} min
                </span>
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
