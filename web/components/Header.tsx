"use client";

import Link from "next/link";

import BuildingSearch from "@/components/BuildingSearch";
import type { Building, RouteMode } from "@/lib/api";

const MODES: { id: RouteMode; label: string }[] = [
  { id: "shortest", label: "Shortest" },
  { id: "accessible", label: "Accessible" },
  { id: "weather", label: "Weather" },
];

type Props = {
  buildings: Building[];
  start: Building | null;
  target: Building | null;
  mode: RouteMode;
  searchFor: "start" | "target" | null;
  actionLabel: string;
  busy: boolean;
  weatherReady: boolean;
  /// the lab moves this into its sidebar, where it reads as the cost
  /// model rather than as how you would like to get there
  showModes?: boolean;
  /// where the little link at the top right goes
  otherMode: { href: string; label: string };
  onOpenSearch: (which: "start" | "target") => void;
  onCloseSearch: () => void;
  onPick: (which: "start" | "target", building: Building) => void;
  onSwap: () => void;
  onMode: (mode: RouteMode) => void;
  onRun: () => void;
};

export default function Header(props: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        Campus Router
        <Link className="mode-link" href={props.otherMode.href}>
          {props.otherMode.label}
        </Link>
      </div>

      <div className="ends">
        <BuildingSearch
          label="START"
          placeholder="Search a building…"
          buildings={props.buildings}
          chosen={props.start}
          open={props.searchFor === "start"}
          onOpen={() => props.onOpenSearch("start")}
          onClose={props.onCloseSearch}
          onPick={(b) => props.onPick("start", b)}
        />

        <button
          type="button"
          className="swap"
          onClick={props.onSwap}
          title="Swap start and destination"
          aria-label="Swap start and destination"
        >
          ⇄
        </button>

        <BuildingSearch
          label="DESTINATION"
          placeholder="Search a building…"
          buildings={props.buildings}
          chosen={props.target}
          open={props.searchFor === "target"}
          onOpen={() => props.onOpenSearch("target")}
          onClose={props.onCloseSearch}
          onPick={(b) => props.onPick("target", b)}
        />
      </div>

      {props.showModes === false ? null : (
      <div className="segmented" role="group" aria-label="routing mode">
        {MODES.map((mode) => {
          // weather mode still works without a reading, it just cannot do
          // anything useful, so say that rather than hiding it
          const degraded = mode.id === "weather" && !props.weatherReady;
          return (
            <button
              type="button"
              key={mode.id}
              className={`${props.mode === mode.id ? "is-active" : ""}${degraded ? " is-degraded" : ""}`}
              aria-pressed={props.mode === mode.id}
              title={
                degraded
                  ? "No weather reading, this will route as shortest distance"
                  : undefined
              }
              onClick={() => props.onMode(mode.id)}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      )}

      <button
        type="button"
        className="primary"
        onClick={props.onRun}
        disabled={props.busy}
      >
        {props.actionLabel}
      </button>
    </header>
  );
}

export const MODE_NOTES: Record<RouteMode, string> = {
  shortest: "Shortest distance, nothing weighted",
  accessible: "Steps avoided, rough surfaces discouraged",
  weather: "Surface state inferred from the weather",
};
