"use client";

import Link from "next/link";

import BuildingSearch from "@/components/BuildingSearch";
import type { Building } from "@/lib/api";

type Props = {
  buildings: Building[];
  start: Building | null;
  target: Building | null;
  searchFor: "start" | "target" | null;
  actionLabel: string;
  busy: boolean;
  /// where the little link at the top right goes
  otherMode: { href: string; label: string };
  onOpenSearch: (which: "start" | "target") => void;
  onCloseSearch: () => void;
  onPick: (which: "start" | "target", building: Building) => void;
  onSwap: () => void;
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

// The map used to carry a chip naming the mode. It went because the
// picker in the sidebar already says which mode is on, and a second
// label in a different voice added nothing. The weather reading chip is
// separate and stays.
