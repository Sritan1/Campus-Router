import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, requestRoute } from "./api";

function stubFetch(body: unknown = { results: [], pathGroups: [] }) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("asking for a route", () => {
  it("does not cap the trace", async () => {
    // this one bit. a cap here once left dijkstra with 17 percent of its search
    const fetchMock = stubFetch();
    await requestRoute({
      start: "ARC",
      target: "SES",
      mode: "shortest",
      algorithms: ["dijkstra"],
      trace: true,
    });

    expect(sentBody(fetchMock)).not.toHaveProperty("maxTraceSamples");
  });

  it("sends what it was given and nothing more", async () => {
    const fetchMock = stubFetch();
    await requestRoute({
      start: "SEO",
      target: "LCC",
      mode: "accessible",
      algorithms: ["astar", "bfs"],
      trace: false,
    });

    expect(sentBody(fetchMock)).toEqual({
      start: "SEO",
      target: "LCC",
      mode: "accessible",
      algorithms: ["astar", "bfs"],
      trace: false,
    });
  });

  it("turns a failure into an error rather than a broken reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ detail: "the routing engine is not responding" }),
      })) as unknown as typeof fetch,
    );

    await expect(
      requestRoute({
        start: "SEO",
        target: "LCC",
        mode: "shortest",
        algorithms: ["astar"],
        trace: false,
      }),
    ).rejects.toThrow("the routing engine is not responding");
  });

  it("survives an error body that is not json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      })) as unknown as typeof fetch,
    );

    // the status rides on the error, since a message saying 500 told nobody anything
    const failed = requestRoute({
      start: "SEO",
      target: "LCC",
      mode: "shortest",
      algorithms: ["astar"],
      trace: false,
    });

    await expect(failed).rejects.toBeInstanceOf(ApiError);
    await expect(failed).rejects.toMatchObject({ status: 500 });
    await expect(failed).rejects.toThrow(/try again/i);
  });
});
