"use client";

import Link from "next/link";
import { useState } from "react";

import type { RouteMode, RouteReply } from "@/lib/api";
import { agreementFor } from "@/lib/agreement";
import { distance, duration } from "@/lib/format";

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
  shortest: "Shortest walk between the two buildings.",
  accessible: "Step free route. Rough surfaces avoided where the data says so.",
  weather: "Adjusted for what the ground is likely to be underfoot.",
};

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
      <div className="panel">
        <h2 className="panel-title">Where are you going?</h2>
        <p className="empty-body">
          Pick a start and a destination, and this will find the walk between
          them across campus footpaths.
        </p>
        <p className="empty-body">{MODE_SUMMARY[mode]}</p>
        <button type="button" className="primary run-button" onClick={onRun} disabled={!ready}>
          Find route
        </button>
      </div>
    );
  }

  const best = reply.results.find((r) => r.status === "ok");

  if (!best) {
    return (
      <div className="panel">
        <h2 className="panel-title">
          {mode === "accessible" ? "No step free route" : "No route found"}
        </h2>
        {mode === "accessible" ? (
          <>
            <p className="empty-body">
              There is no way between these two buildings that avoids steps,
              going by the paths OpenStreetMap has mapped around campus.
            </p>
            <p className="empty-body">
              Accessibility tagging here is incomplete, so a route may exist
              even though the data does not show one.
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

  return (
    <div className="panel">
      <div className="headline">
        <span className="headline-distance">{distance(best.distanceM)}</span>
        <span className="headline-time">{duration(best.estSeconds)} walk</span>
      </div>

      <p className="empty-body">{MODE_SUMMARY[mode]}</p>
      {reply.cost.notes.map((note) => (
        <p className="foot-note" key={note}>
          {note}
        </p>
      ))}

      <div className="spacer" />

      {agreement ? (
        <Link className="invite" href={labHref}>
          <span className="invite-headline">{agreement.headline}</span>
          <span className="invite-action">{agreement.invite} →</span>
        </Link>
      ) : null}

      <CopyLink />
    </div>
  );
}
