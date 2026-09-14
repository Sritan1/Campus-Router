"use client";

import Link from "next/link";

import type { Building, Directions, RouteMode, RouteReply } from "@/lib/api";
import { agreementFor } from "@/lib/agreement";
import { ALGORITHM_COLORS, MODE_LABEL, distance, duration } from "@/lib/format";
import ModePicker from "@/components/ModePicker";

// the four lanes, in the order the lab races them
const LANE_COLOURS = [
  ALGORITHM_COLORS.dijkstra,
  ALGORITHM_COLORS.astar,
  ALGORITHM_COLORS.bidirectional,
  ALGORITHM_COLORS.bfs,
];

type Props = {
  reply: RouteReply | null;
  start: Building | null;
  target: Building | null;
  mode: RouteMode;
  weatherReady: boolean;
  busy: boolean;
  error: string | null;
  ready: boolean;
  labHref: string;
  onRun: () => void;
  onMode: (mode: RouteMode) => void;
  /// throws the route away and keeps the pair, like clear reach does
  onClear: () => void;
};

const MODE_SUMMARY: Record<RouteMode, string> = {
  shortest: "The quickest way across campus on foot.",
  accessible: "A step free route that sticks to well-paved paths.",
  weather: "Winter-aware routing that steers you off the surfaces that turn treacherous.",
};

/// What the search is about to do, before it has done it.
///
/// Same card the reach view shows, since both are a receipt of the
/// settings you are about to run.
function Summary({
  start,
  target,
  mode,
}: {
  start: Building | null;
  target: Building | null;
  mode: RouteMode;
}) {
  const named = (building: Building | null) =>
    building ? building.abbr ?? building.name : "Not picked yet";

  return (
    <div className="summary">
      <p className="section-label summary-head">Route</p>
      <div className="summary-row">
        <span className="summary-key">
          <span className="summary-dot" aria-hidden="true" />
          Start
        </span>
        <span className="summary-value">{named(start)}</span>
      </div>
      <div className="summary-row">
        <span className="summary-key">
          <span className="summary-dot" aria-hidden="true" />
          Destination
        </span>
        <span className="summary-value">{named(target)}</span>
      </div>
      <div className="summary-row">
        <span className="summary-key">Mode</span>
        <span className="summary-value">{MODE_LABEL[mode]}</span>
      </div>
    </div>
  );
}

function Stats({ guide }: { guide: Directions }) {
  return (
    <div className="stat-row">
      <div className="stat">
        <span className="stat-value">{guide.turns}</span>
        <span className="stat-label">turns</span>
      </div>
      <div className="stat">
        <span className="stat-value">{guide.crossings}</span>
        <span className="stat-label">crossings</span>
      </div>
      <div className="stat">
        <span className="stat-value">{guide.onFootpath}%</span>
        <span className="stat-label">on footpath</span>
      </div>
    </div>
  );
}

function Steps({ guide }: { guide: Directions }) {
  return (
    <>
      <p className="section-label">Directions</p>
      <ol className="steps">
        {guide.steps.map((step, i) => (
          <li className={`step is-${step.kind}`} key={`${step.text}-${i}`}>
            <span className="step-dot" aria-hidden="true" />
            <span className="step-text">{step.text}</span>
            <span className="step-metres">{step.metres} m</span>
          </li>
        ))}
      </ol>
    </>
  );
}

export default function NavigatePanel(props: Props) {
  const { reply, start, target, mode, weatherReady, busy, error, ready, labHref, onRun, onMode, onClear } =
    props;
  const picker = (
    <ModePicker mode={mode} weatherReady={weatherReady} onMode={onMode} />
  );

  if (error) {
    return (
      <div className="panel">
        <h2 className="panel-title">Something went wrong</h2>
        <p className="empty-body">{error}</p>
        <button type="button" className="primary" onClick={onRun}>
          Try again
        </button>
      </div>
    );
  }

  if (busy) {
    return (
      <div className="panel">
        <h2 className="panel-title">Finding a route…</h2>
        <div className="skeletons">
          <span className="skeleton-bar" />
          <span className="skeleton-bar" />
        </div>
      </div>
    );
  }

  if (!reply) {
    return (
      <div className="panel panel-stack">
        <div className="panel-scroll">
          <h2 className="panel-title">Where are you going?</h2>
          <p className="empty-body">Pick a start and a destination to begin.</p>
          {picker}
          <p className="empty-body mode-caption">{MODE_SUMMARY[mode]}</p>
          <Summary start={start} target={target} mode={mode} />
        </div>
        <div className="panel-foot">
          <button type="button" className="primary" onClick={onRun} disabled={!ready}>
            Find route
          </button>
        </div>
      </div>
    );
  }

  const best = reply.results.find((r) => r.status === "ok");

  // no pair on campus fails today, but the engine can still answer
  // no_path, so the guard stays rather than reading a route that is
  // not there
  if (!best) {
    return (
      <div className="panel">
        <h2 className="panel-title">No route found</h2>
        {/* a step free failure is a claim about our map rather than about
            the building, and saying it the other way round would be wrong
            about a place somebody may actually need to get into */}
        <p className="empty-body">
          {mode === "accessible"
            ? "No step free route to the entrance we know about. There may still be one we have not mapped."
            : "These two buildings are not connected by the mapped path network."}
        </p>
      </div>
    );
  }

  const agreement = agreementFor(reply);
  const guide = reply.directions;

  return (
    <div className="panel panel-stack">
      <div className="panel-scroll">
        <div className="headline">
          <span className="headline-distance">{distance(best.distanceM)}</span>
          <span className="headline-time">{duration(best.estSeconds)} walk</span>
        </div>

        {/* the picker rides with the sentence in both states, otherwise
            there is no way to change mode once a route is on screen */}
        {picker}
        <p className="lede">{MODE_SUMMARY[mode]}</p>
        {reply.cost.notes.map((note) => (
          <p className="foot-note" key={note}>
            {note}
          </p>
        ))}

        {/* only on the results, not the idle panel. the caption above is
            pinned to two lines to stop the card jumping, and a note that
            appears for one mode only would start it jumping again. */}
        {mode === "accessible" ? (
          <p className="caveat">
            Accessible routing reads OpenStreetMap, which maps stairs far more
            completely than ramps, so treat this as a good guess rather than a
            guarantee. <Link href="/about">More on accessible routing</Link>
          </p>
        ) : null}

        {guide ? <Stats guide={guide} /> : null}
        {guide && guide.steps.length > 2 ? <Steps guide={guide} /> : null}

        {agreement ? (
          <Link className="invite" href={labHref}>
            <span className="invite-dots" aria-hidden="true">
              {LANE_COLOURS.map((colour) => (
                <span key={colour} style={{ background: colour }} />
              ))}
            </span>
            <span className="invite-headline">{agreement.headline}</span>
            <span className="invite-action">{agreement.invite} →</span>
          </Link>
        ) : null}
      </div>

      {/* the route goes and the two buildings stay, since this means try
          something else on these two rather than start from an empty
          form. clear reach does the same to an area. */}
      <div className="panel-foot">
        <button type="button" className="primary" onClick={onClear}>
          New route
        </button>
      </div>
    </div>
  );
}
