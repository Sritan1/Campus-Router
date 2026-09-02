"use client";

import type { Isochrone } from "@/lib/api";

type Props = {
  data: Isochrone | null;
  minutes: number;
  busy: boolean;
  error: string | null;
  ready: boolean;
  onMinutes: (minutes: number) => void;
  onRun: () => void;
};

const CHOICES = [3, 5, 10, 15];

export default function ReachPanel({
  data,
  minutes,
  busy,
  error,
  ready,
  onMinutes,
  onRun,
}: Props) {
  return (
    <div className="panel">
      <h2 className="panel-title">How far can I get?</h2>
      <p className="empty-body">
        Everywhere you can walk to from your start, going by campus
        footpaths.
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

      {data && !busy ? (
        <>
          {data.buildings.length > 0 ? (
            <div className="reach-list">
              <div className="cost-model-head">
                {data.buildings.length} buildings in reach
              </div>
              {data.buildings.slice(0, 12).map((building) => (
                <span className="reach-row" key={building.id}>
                  <span className="reach-name">
                    {building.abbr ?? building.name}
                  </span>
                  <span className="reach-time">
                    {Math.max(1, Math.round(building.seconds / 60))} min
                  </span>
                </span>
              ))}
              {data.buildings.length > 12 ? (
                <span className="panel-hint">
                  and {data.buildings.length - 12} more
                </span>
              ) : null}
            </div>
          ) : (
            <p className="empty-body">No other buildings within this time.</p>
          )}

          <p className="foot-note">
            The outline is traced around the ground the search actually
            reached, so it follows the paths rather than being drawn around
            the outside of them. It will not stretch across somewhere you
            cannot walk.
          </p>
        </>
      ) : null}

      <button
        type="button"
        className="primary run-button"
        onClick={onRun}
        disabled={!ready || busy}
      >
        {busy ? "Working…" : "Show reach"}
      </button>
      {!ready ? (
        <p className="panel-hint centered">pick a start building</p>
      ) : null}
    </div>
  );
}
