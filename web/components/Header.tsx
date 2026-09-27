"use client";

import Link from "next/link";

import BrandMark from "@/components/BrandMark";
import BuildingSearch from "@/components/BuildingSearch";
import type { Building } from "@/lib/api";

type Props = {
  buildings: Building[];
  start: Building | null;
  target: Building | null;
  searchFor: "start" | "target" | null;
  actionLabel: string;
  busy: boolean;
  // the link under the wordmark
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
        <BrandMark />
        <span className="brand-stack">
          <span className="brand-word">
            <span>Campus</span>
            <span> Router</span>
          </span>
          {/* one row, so the brand stays two lines tall */}
          <span className="brand-links">
            <Link className="mode-link" href={props.otherMode.href}>
              {props.otherMode.label}
            </Link>
            {/* its own element, or it lights up with the link on hover */}
            <span className="brand-sep" aria-hidden="true">
              ·
            </span>
            <Link className="mode-link" href="/about">
              About
            </Link>
          </span>
        </span>
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
