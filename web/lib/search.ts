// on the client, since the list is small and typing should not wait on the network

import type { Building } from "./api";

export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termsFor(building: Building): string[] {
  const terms = [building.name, ...building.aliases];
  if (building.abbr) {
    terms.push(building.abbr);
  }
  return terms.map(fold);
}

// exact code first, then names starting with the query, then any match
export function searchBuildings(
  buildings: Building[],
  query: string,
  limit = 8,
): Building[] {
  const wanted = fold(query);
  if (!wanted) {
    return buildings.slice(0, limit);
  }

  const exact: Building[] = [];
  const starts: Building[] = [];
  const contains: Building[] = [];

  for (const building of buildings) {
    const terms = termsFor(building);
    if (building.abbr && fold(building.abbr) === wanted) {
      exact.push(building);
    } else if (terms.some((term) => term.startsWith(wanted))) {
      starts.push(building);
    } else if (terms.some((term) => term.includes(wanted))) {
      contains.push(building);
    }
  }

  return [...exact, ...starts, ...contains].slice(0, limit);
}

export function labelFor(building: Building): string {
  return building.abbr ? `${building.name} (${building.abbr})` : building.name;
}
