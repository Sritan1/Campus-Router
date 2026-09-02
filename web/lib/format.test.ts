import { describe, expect, it } from "vitest";

import { count, distance, duration, runtime, temperature, wind } from "./format";

describe("distance", () => {
  it("uses metres up to a kilometre and miles past that", () => {
    expect(distance(80)).toBe("80 m");
    expect(distance(815.9)).toBe("816 m");
    expect(distance(1609.344)).toBe("1.00 mi");
  });

  it("can tell two campus routes apart", () => {
    // dijkstra and bfs on the same pair. in miles to two places these
    // were both "0.23 mi", which hid the entire point of racing them.
    expect(distance(367.6)).not.toBe(distance(373.8));
  });

  it("shows a dash when there is nothing to show", () => {
    expect(distance(undefined)).toBe("—");
  });
});

describe("duration", () => {
  it("rounds to whole minutes", () => {
    expect(duration(508)).toBe("8 min");
  });

  it("does not say zero minutes", () => {
    expect(duration(20)).toBe("under a minute");
  });

  it("shows a dash when there is nothing to show", () => {
    expect(duration(undefined)).toBe("—");
  });
});

describe("runtime", () => {
  it("keeps microseconds when that is what it is", () => {
    // the engine really is this fast, so rounding to ms would show zeroes
    expect(runtime(187)).toBe("187 µs");
  });

  it("switches to milliseconds once it is worth it", () => {
    expect(runtime(2500)).toBe("2.5 ms");
  });
});

describe("counts", () => {
  it("groups thousands", () => {
    expect(count(4180)).toBe("4,180");
  });
});

describe("weather", () => {
  it("converts to fahrenheit", () => {
    expect(temperature(5)).toBe("41°F");
    expect(temperature(0)).toBe("32°F");
  });

  it("converts wind to miles an hour", () => {
    expect(wind(5.4)).toBe("12 mph");
  });

  it("handles a missing reading without pretending", () => {
    expect(temperature(null)).toBe("—");
    expect(wind(null)).toBe("—");
  });
});
