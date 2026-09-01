import { describe, expect, it } from "vitest";

import type { Building } from "./api";
import { fold, labelFor, searchBuildings } from "./search";

function building(name: string, abbr: string | null, aliases: string[] = []): Building {
  return {
    id: name,
    nodeId: -1,
    name,
    abbr,
    aliases,
    wheelchair: null,
    lat: 0,
    lon: 0,
  };
}

const LIST = [
  building("Science & Engineering Offices", "SEO"),
  building("Science and Engineering Laboratories", "SEL", ["SELE", "SELW"]),
  building("Lecture Center C", "LCC"),
  building("Student Center East", "SCE"),
  building("Richard J. Daley Library", "LIB"),
  building("Behavioral Sciences Building", "BSB"),
];

describe("folding", () => {
  it("treats and and an ampersand the same", () => {
    expect(fold("Science & Engineering")).toBe(fold("science and engineering"));
  });

  it("ignores case, hyphens and extra spaces", () => {
    expect(fold("Hull-House   Museum")).toBe("hull house museum");
  });
});

describe("searching", () => {
  it("gives everything back for an empty query", () => {
    expect(searchBuildings(LIST, "").length).toBe(LIST.length);
  });

  it("puts an exact building code first", () => {
    const found = searchBuildings(LIST, "seo");
    expect(found[0].abbr).toBe("SEO");
  });

  it("finds a building typed with and rather than an ampersand", () => {
    const found = searchBuildings(LIST, "science and engineering offices");
    expect(found[0].abbr).toBe("SEO");
  });

  it("matches on an alias", () => {
    const found = searchBuildings(LIST, "selw");
    expect(found[0].abbr).toBe("SEL");
  });

  it("prefers names that start with the query over ones that contain it", () => {
    const found = searchBuildings(LIST, "lecture");
    expect(found[0].name).toBe("Lecture Center C");
  });

  it("still finds a word from the middle of a name", () => {
    const found = searchBuildings(LIST, "daley");
    expect(found[0].abbr).toBe("LIB");
  });

  it("returns nothing rather than everything for a miss", () => {
    expect(searchBuildings(LIST, "zzzz")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchBuildings(LIST, "", 2)).toHaveLength(2);
  });
});

describe("labels", () => {
  it("shows the code when there is one", () => {
    expect(labelFor(LIST[0])).toBe("Science & Engineering Offices (SEO)");
  });

  it("falls back to just the name", () => {
    expect(labelFor(building("Some Hall", null))).toBe("Some Hall");
  });
});
