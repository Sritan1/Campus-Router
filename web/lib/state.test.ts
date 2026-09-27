import { describe, expect, it } from "vitest";

import type { RouteReply } from "./api";
import { INITIAL, algorithmsFor, canRun, reduce, type AppState } from "./state";

function withEnds(extra: Partial<AppState> = {}): AppState {
  return { ...INITIAL, startId: "1", targetId: "2", ...extra };
}

function fakeReply(): RouteReply {
  return {
    start: {} as never,
    target: {} as never,
    mode: "shortest",
    results: [
      { algorithm: "dijkstra", status: "no_path", nodesVisited: 1, edgesRelaxed: 1, runtimeUs: 1 },
      { algorithm: "astar", status: "ok", nodesVisited: 2, edgesRelaxed: 2, runtimeUs: 2 },
    ],
    directions: null,
    pathGroups: [],
    cost: {
      source: "test",
      notes: [],
      blockedClasses: 0,
      adjustedClasses: 0,
      walkingSpeedMps: 1.607,
      speedDerived: false,
    },
    weather: null,
  };
}

describe("starting state", () => {
  it("does not prefill a building the user never picked", () => {
    expect(INITIAL.startId).toBeNull();
    expect(INITIAL.targetId).toBeNull();
  });

  it("starts in race mode, which is the headline feature", () => {
    expect(INITIAL.race).toBe(true);
  });
});

describe("running", () => {
  it("will not run without both ends", () => {
    expect(canRun(INITIAL)).toBe(false);
    expect(canRun({ ...INITIAL, startId: "1" })).toBe(false);
    expect(canRun(withEnds())).toBe(true);
  });

  it("will not run from a building to itself", () => {
    expect(canRun(withEnds({ targetId: "1" }))).toBe(false);
  });

  it("opens the empty field instead of erroring", () => {
    const opened = reduce(INITIAL, { type: "run", request: 1 });
    expect(opened.searchFor).toBe("start");
    expect(opened.phase).toBe("idle");

    const half = reduce({ ...INITIAL, startId: "1" }, { type: "run", request: 1 });
    expect(half.searchFor).toBe("target");
  });

  it("never waits on a trip from a building to itself", () => {
    const same = reduce(withEnds({ targetId: "1" }), { type: "run", request: 1 });
    expect(same.phase).toBe("idle");
    expect(same.request).toBeNull();
  });

  it("goes to running when both ends are set", () => {
    expect(reduce(withEnds(), { type: "run", request: 1 }).phase).toBe("running");
  });
});

describe("replies to an old question", () => {
  it("a reply that lands after the pair changed is dropped", () => {
    const asked = reduce(withEnds(), { type: "run", request: 1 });
    const changed = reduce(asked, { type: "pickBuilding", which: "target", id: "9" });
    const late = reduce(changed, { type: "arrived", request: 1, reply: fakeReply() });
    expect(late).toBe(changed);
  });

  it("only the newest run is answered", () => {
    const first = reduce(withEnds(), { type: "run", request: 1 });
    const second = reduce(first, { type: "run", request: 2 });
    expect(reduce(second, { type: "arrived", request: 1, reply: fakeReply() })).toBe(second);
    expect(reduce(second, { type: "arrived", request: 2, reply: fakeReply() }).reply).not.toBeNull();
  });

  it("a late failure does not land on the new question", () => {
    const asked = reduce(withEnds(), { type: "run", request: 1 });
    const changed = reduce(asked, { type: "swapEnds" });
    expect(reduce(changed, { type: "failed", request: 1, message: "down" }).error).toBeNull();
  });
});

describe("things that invalidate a result", () => {
  const settled = withEnds({ phase: "results", reply: fakeReply() });

  it("changing mode clears the result", () => {
    const next = reduce(settled, { type: "setMode", mode: "accessible" });
    expect(next.phase).toBe("idle");
    expect(next.reply).toBeNull();
  });

  it("picking the mode already selected changes nothing", () => {
    expect(reduce(settled, { type: "setMode", mode: "shortest" })).toBe(settled);
  });

  it("changing a building clears the result", () => {
    const next = reduce(settled, { type: "pickBuilding", which: "target", id: "9" });
    expect(next.targetId).toBe("9");
    expect(next.reply).toBeNull();
  });

  it("swapping ends clears the result and flips them", () => {
    const next = reduce(settled, { type: "swapEnds" });
    expect(next.startId).toBe("2");
    expect(next.targetId).toBe("1");
    expect(next.reply).toBeNull();
  });

  it("choosing an algorithm turns race off and clears the result", () => {
    const next = reduce(settled, { type: "pickAlgorithm", algorithm: "bfs" });
    expect(next.race).toBe(false);
    expect(next.algorithm).toBe("bfs");
    expect(next.selected).toBe("bfs");
    expect(next.reply).toBeNull();
  });
});

describe("selecting lanes", () => {
  it("picking a lane does not throw the result away", () => {
    const settled = withEnds({ phase: "results", reply: fakeReply() });
    const next = reduce(settled, { type: "selectLane", algorithm: "bfs" });
    expect(next.selected).toBe("bfs");
    expect(next.reply).not.toBeNull();
    expect(next.phase).toBe("results");
  });

  it("a finished race selects the first algorithm that found something", () => {
    const running = withEnds({ phase: "running", request: 1 });
    const next = reduce(running, { type: "arrived", request: 1, reply: fakeReply() });
    // dijkstra came back no_path, so astar is the one to draw
    expect(next.selected).toBe("astar");
  });

  it("a single algorithm run selects that algorithm", () => {
    const running = withEnds({ phase: "running", race: false, algorithm: "bfs", request: 1 });
    const next = reduce(running, { type: "arrived", request: 1, reply: fakeReply() });
    expect(next.selected).toBe("bfs");
  });
});

describe("playback", () => {
  it("the reply arriving does not end the running phase", () => {
    const running = withEnds({ phase: "running", request: 1 });
    const next = reduce(running, { type: "arrived", request: 1, reply: fakeReply() });
    expect(next.phase).toBe("running");
    expect(next.reply).not.toBeNull();
  });

  it("finishing moves to results", () => {
    const animating = withEnds({ phase: "running", reply: fakeReply() });
    expect(reduce(animating, { type: "finished" }).phase).toBe("results");
  });

  it("finishing with nothing to show is ignored", () => {
    const waiting = withEnds({ phase: "running" });
    expect(reduce(waiting, { type: "finished" })).toBe(waiting);
  });

  it("replay reuses the result instead of refetching", () => {
    const settled = withEnds({ phase: "results", reply: fakeReply(), showTable: true });
    const next = reduce(settled, { type: "replay" });
    expect(next.phase).toBe("running");
    expect(next.reply).not.toBeNull();
    // the table would cover the map during playback
    expect(next.showTable).toBe(false);
  });

  it("replay does nothing when there is no result yet", () => {
    expect(reduce(INITIAL, { type: "replay" })).toBe(INITIAL);
  });
});

describe("comparison table", () => {
  it("toggles without touching the result", () => {
    const settled = withEnds({ phase: "results", reply: fakeReply() });
    const opened = reduce(settled, { type: "toggleTable" });
    expect(opened.showTable).toBe(true);
    expect(opened.reply).not.toBeNull();
    expect(reduce(opened, { type: "toggleTable" }).showTable).toBe(false);
  });
});

describe("failures", () => {
  it("drops back to idle and keeps the message", () => {
    const next = reduce(withEnds({ phase: "running", request: 1 }), {
      type: "failed",
      request: 1,
      message: "engine is down",
    });
    expect(next.phase).toBe("idle");
    expect(next.error).toBe("engine is down");
    expect(next.reply).toBeNull();
  });

  it("running again clears the old error", () => {
    const failed = withEnds({ error: "engine is down" });
    expect(reduce(failed, { type: "run", request: 1 }).error).toBeNull();
  });
});

describe("reset", () => {
  it("clears the route but keeps the pair and how the user likes to search", () => {
    const settled = withEnds({
      phase: "results",
      reply: fakeReply(),
      mode: "accessible",
      race: false,
      algorithm: "bfs",
    });
    const next = reduce(settled, { type: "reset" });

    expect(next.startId).toBe("1");
    expect(next.targetId).toBe("2");
    expect(next.phase).toBe("idle");
    expect(next.reply).toBeNull();
    expect(next.showTable).toBe(false);
    expect(next.mode).toBe("accessible");
    expect(next.race).toBe(false);
    expect(next.algorithm).toBe("bfs");
  });
});

describe("which algorithms get asked for", () => {
  it("race asks for all four", () => {
    expect(algorithmsFor(INITIAL)).toHaveLength(4);
  });

  it("single mode asks for one", () => {
    expect(algorithmsFor({ ...INITIAL, race: false, algorithm: "bfs" })).toEqual(["bfs"]);
  });

  it("race can be turned back on from the results view", () => {
    const single = withEnds({ race: false, algorithm: "bfs", phase: "results" });
    expect(reduce(single, { type: "setRace", race: true }).race).toBe(true);
  });

  it("asking for the race state it is already in changes nothing", () => {
    const racing = withEnds({ race: true, phase: "results" });
    expect(reduce(racing, { type: "setRace", race: true })).toBe(racing);
  });
});
