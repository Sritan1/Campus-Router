"use client";

// The bits both modes need. Navigate and the lab ask the same questions
// about buildings, the graph and the weather, so they ask them here.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchBuildings,
  fetchGraphMeta,
  fetchWeather,
  type Building,
  type RouteMode,
} from "./api";
import { temperature, wind } from "./format";
import { findBuilding, readUrl, writeUrl, type UrlState } from "./url";

export function useCampus() {
  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: fetchBuildings,
    staleTime: Infinity,
  });

  const meta = useQuery({
    queryKey: ["graphMeta"],
    queryFn: fetchGraphMeta,
    staleTime: Infinity,
  });

  const weather = useQuery({
    queryKey: ["weather"],
    queryFn: fetchWeather,
    refetchInterval: 10 * 60 * 1000,
  });

  const list = useMemo(() => buildings.data ?? [], [buildings.data]);
  const weatherReady = Boolean(weather.data && weather.data.available !== false);

  const weatherChip = (() => {
    if (weather.isLoading) {
      return "weather…";
    }
    if (!weatherReady) {
      return "weather unavailable";
    }
    const value = weather.data as { tempC: number | null; windMps: number | null };
    return `${temperature(value.tempC)} · wind ${wind(value.windMps)}`;
  })();

  return { buildings, meta, weather, list, weatherReady, weatherChip };
}

/// Reads a shared link once, after the buildings have arrived.
///
/// Returns what the link asked for and a note about anything in it we
/// could not find, so the page can say so instead of quietly ignoring it.
export function useRestoreFromUrl(
  list: Building[],
  apply: (found: {
    start: Building | null;
    target: Building | null;
    wanted: UrlState;
  }) => void,
) {
  const doneRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (doneRef.current || list.length === 0) {
      return;
    }
    doneRef.current = true;

    const wanted = readUrl(window.location.search);
    const start = findBuilding(list, wanted.from);
    const target = findBuilding(list, wanted.to);

    const missing = [
      wanted.from && !start ? wanted.from : null,
      wanted.to && !target ? wanted.to : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      setNotice(`Could not find ${missing.join(" or ")} on campus`);
    }

    apply({ start, target, wanted });
    // apply is recreated every render, and this must only ever run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  return { notice, setNotice, restored: doneRef };
}

/// Keeps the address bar current, without piling up history entries.
export function useWriteUrl(
  ready: boolean,
  input: {
    from: Building | null;
    to: Building | null;
    mode: RouteMode;
    race: boolean;
    algorithm: "dijkstra" | "astar" | "bfs" | "bidirectional";
  },
) {
  const { from, to, mode, race, algorithm } = input;

  useEffect(() => {
    if (!ready) {
      return;
    }
    const query = writeUrl({ from, to, mode, race, algorithm });
    window.history.replaceState(null, "", `${window.location.pathname}${query}`);
  }, [ready, from, to, mode, race, algorithm]);
}
