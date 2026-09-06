"use client";

import Link from "next/link";
import { useState } from "react";

import type { Directions, RouteMode, RouteReply } from "@/lib/api";
import { agreementFor } from "@/lib/agreement";
import { ALGORITHM_COLORS, distance, duration } from "@/lib/format";

// the four lanes, in the order the lab races them
const LANE_COLOURS = [
  ALGORITHM_COLORS.dijkstra,
  ALGORITHM_COLORS.astar,
  ALGORITHM_COLORS.bidirectional,
  ALGORITHM_COLORS.bfs,
];

type Props = {
  reply: RouteReply | null;
  mode: RouteMode;
  busy: boolean;
  error: string | null;
  ready: boolean;
  labHref: string;
  onRun: () => void;
  onShowShortest: () => void;
};

const MODE_SUMMARY: Record<RouteMode, string> = {
  shortest: "The quickest way across campus on foot.",
  accessible: "A step free route that sticks to well-paved paths.",
  weather: "Winter-aware routing that steers you off the surfaces that turn treacherous.",
};

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

function CopyLink() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard can be blocked, and there is nothing useful to do
      // about it beyond not pretending it worked
      setCopied(false);
    }
  }

  return (
    <button type="button" className="secondary" onClick={copy}>
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

export default function NavigatePanel(props: Props) {
  const { reply, mode, busy, error, ready, labHref, onRun, onShowShortest } = props;

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
          <p className="empty-body">{MODE_SUMMARY[mode]}</p>
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

  if (!best) {
    return (
      <div className="panel">
        <h2 className="panel-title">
          {mode === "accessible"
            ? "Could not find a step free route"
            : "No route found"}
        </h2>
        {mode === "accessible" ? (
          <>
            <p className="empty-body">
              The mapped footpaths offer no way between these buildings without
              steps.
            </p>
            <button type="button" className="secondary" onClick={onShowShortest}>
              Show the shortest route instead
            </button>
          </>
        ) : (
          <p className="empty-body">
            These two buildings are not connected by the mapped path network.
          </p>
        )}
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

        <p className="lede">{MODE_SUMMARY[mode]}</p>
        {reply.cost.notes.map((note) => (
          <p className="foot-note" key={note}>
            {note}
          </p>
        ))}

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

      <div className="panel-foot">
        <CopyLink />
      </div>
    </div>
  );
}
