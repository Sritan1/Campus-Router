"use client";

import type { RouteMode } from "@/lib/api";
import { MODE_LABEL } from "@/lib/format";

const MODES: RouteMode[] = ["shortest", "accessible", "weather"];

type Props = {
  mode: RouteMode;
  weatherReady: boolean;
  onMode: (mode: RouteMode) => void;
};

/// How you would like to get there, above both navigate views.
///
/// It sits over the panel rather than in the header because it applies
/// to the route and to how far you can get, not to one of them.
export default function ModePicker({ mode, weatherReady, onMode }: Props) {
  return (
    <div className="preference">
      <p className="section-label">Preference</p>
      <div className="segmented" role="group" aria-label="routing mode">
        {MODES.map((choice) => {
          // weather mode still works without a reading, it just cannot do
          // anything useful, so say that rather than hiding it
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
