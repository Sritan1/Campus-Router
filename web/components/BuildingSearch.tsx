"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Building } from "@/lib/api";
import { labelFor, searchBuildings } from "@/lib/search";

type Props = {
  label: string;
  placeholder: string;
  buildings: Building[];
  chosen: Building | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (building: Building) => void;
};

/// A real filtering input with keyboard support. The prototype listed
/// every building regardless of what you typed, which was fine for a
/// wireframe and useless in the actual app.
export default function BuildingSearch({
  label,
  placeholder,
  buildings,
  chosen,
  open,
  onOpen,
  onClose,
  onPick,
}: Props) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(
    () => searchBuildings(buildings, query),
    [buildings, query],
  );

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // clicking anywhere else should put the list away
  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocumentClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open, onClose]);

  function choose(building: Building) {
    setQuery("");
    onPick(building);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (matches[highlight]) {
        choose(matches[highlight]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="search" ref={boxRef}>
      <div className="search-label">{label}</div>

      {open ? (
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${label}-list`}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          // focus stays in the box while the arrows move the highlight, so
          // without this a screen reader never hears which building is
          // picked out and the keyboard support is only there for the eye
          aria-activedescendant={
            matches[highlight] ? `${label}-option-${matches[highlight].id}` : undefined
          }
        />
      ) : (
        <button
          type="button"
          className={`search-value${chosen ? "" : " search-empty"}`}
          onClick={onOpen}
        >
          {chosen ? labelFor(chosen) : placeholder}
        </button>
      )}

      {open ? (
        <div className="search-list" id={`${label}-list`} role="listbox">
          {matches.length === 0 ? (
            // an empty list means the buildings have not arrived yet, since
            // campus does not shrink. saying no match while we are still
            // fetching reads as a broken search rather than a slow one.
            <div className="search-none">
              {buildings.length === 0
                ? "Loading buildings…"
                : `No building matches “${query}”`}
            </div>
          ) : (
            matches.map((building, index) => (
              <button
                type="button"
                key={building.id}
                id={`${label}-option-${building.id}`}
                role="option"
                aria-selected={index === highlight}
                className={`search-option${index === highlight ? " is-active" : ""}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(building)}
              >
                <span>{building.name}</span>
                {building.abbr ? (
                  <span className="search-code">{building.abbr}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
