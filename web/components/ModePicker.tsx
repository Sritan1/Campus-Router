"use client";

import { MODES } from "@/lib/api";
import type { RouteMode } from "@/lib/api";
import { MODE_LABEL } from "@/lib/format";

type Props = {
  mode: RouteMode;
  weatherReady: boolean;
  onMode: (mode: RouteMode) => void;
};

export default function ModePicker({ mode, weatherReady, onMode }: Props) {
  return (
    <div className="preference">
      <p className="section-label">Preference</p>
      <div className="segmented" role="group" aria-label="routing mode">
        {MODES.map((choice) => {
          // weather still works without a reading, so explain rather than hide it
          const degraded = choice === "weather" && !weatherReady;
          return (
            <button
              type="button"
              key={choice}
              className={`${mode === choice ? "is-active" : ""}${degraded ? " is-degraded" : ""}`}
              aria-pressed={mode === choice}
              title={
                degraded
                  ? "No weather data right now, falling back to shortest distance"
                  : undefined
              }
              onClick={() => onMode(choice)}
            >
              {MODE_LABEL[choice]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
