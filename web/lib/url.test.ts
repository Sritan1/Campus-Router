import { describe, expect, it } from "vitest";

import type { Building } from "./api";
import { findBuilding, readUrl, writeUrl } from "./url";

function building(id: string, abbr: string | null, name = "Some Hall"): Building {
  return {
    id,
    nodeId: -Number(id),
    name,
    abbr,
    aliases: [],
    wheelchair: null,
    lat: 0,
    lon: 0,
  };
}

const LIST = [
  building("151960667", "SEO", "Science & Engineering Offices"),
  building("151672202", "LCC", "Lecture Center C"),
  building("999", null, "Nameless Annex"),
];

describe("reading a link", () => {
  it("picks up both ends and the mode", () => {
    const state = readUrl("?from=SEO&to=LCC&mode=accessible&race=1");
    expect(state.from).toBe("SEO");
    expect(state.to).toBe("LCC");
    expect(state.mode).toBe("accessible");
    expect(state.race).toBe(true);
  });

  it("ignores a mode that is not one of ours", () => {
    expect(readUrl("?mode=teleport").mode).toBeNull();
  });

  it("ignores an algorithm that is not one of ours", () => {
    expect(readUrl("?algo=magic").algorithm).toBeNull();
    expect(readUrl("?algo=bfs").algorithm).toBe("bfs");
  });

  it("treats a missing race flag as unset rather than off", () => {
    // unset means keep the default, which is race on
    expect(readUrl("?from=SEO").race).toBeNull();
    expect(readUrl("?race=0").race).toBe(false);
  });

  it("handles an empty query", () => {
    const state = readUrl("");
    expect(state.from).toBeNull();
    expect(state.mode).toBeNull();
  });
});

describe("writing a link", () => {
  it("uses building codes so the link is readable", () => {
    const query = writeUrl({
      from: LIST[0],
      to: LIST[1],
      mode: "shortest",
      race: true,
      algorithm: "astar",
    });
    expect(query).toContain("from=SEO");
    expect(query).toContain("to=LCC");
  });

  it("falls back to the id when a building has no code", () => {
    const query = writeUrl({
      from: LIST[2],
      to: null,
      mode: "shortest",
      race: true,
      algorithm: "astar",
    });
    expect(query).toContain("from=999");
  });

  it("only names an algorithm when racing is off", () => {
    const racing = writeUrl({
      from: null, to: null, mode: "shortest", race: true, algorithm: "bfs",
    });
    expect(racing).not.toContain("algo=");

    const single = writeUrl({
      from: null, to: null, mode: "shortest", race: false, algorithm: "bfs",
    });
    expect(single).toContain("algo=bfs");
  });

  it("survives a round trip", () => {
    const query = writeUrl({
      from: LIST[0],
      to: LIST[1],
      mode: "weather",
      race: false,
      algorithm: "bidirectional",
    });
    const back = readUrl(query);
    expect(back.mode).toBe("weather");
    expect(back.race).toBe(false);
    expect(back.algorithm).toBe("bidirectional");
    expect(findBuilding(LIST, back.from)?.abbr).toBe("SEO");
  });
});

describe("finding what a link asked for", () => {
  it("matches a code whatever the casing", () => {
    expect(findBuilding(LIST, "seo")?.abbr).toBe("SEO");
    expect(findBuilding(LIST, "SEO")?.abbr).toBe("SEO");
  });

  it("still accepts a raw id, so older links keep working", () => {
    expect(findBuilding(LIST, "151672202")?.abbr).toBe("LCC");
  });

  it("gives nothing back for a building that is not there", () => {
    // the page turns this into a notice rather than a broken start
    expect(findBuilding(LIST, "NOPE")).toBeNull();
    expect(findBuilding(LIST, null)).toBeNull();
  });
});
