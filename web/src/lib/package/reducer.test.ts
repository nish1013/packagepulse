import { describe, expect, it } from "vitest";
import { fixtureEvents, replay } from "@/test/sse";
import { initialPackageState, packageReducer } from "./reducer";

describe("packageReducer", () => {
  it("builds provider lanes and the report from a recorded stream", async () => {
    const state = replay(packageReducer, initialPackageState, await fixtureEvents("package-stream-fastapi.sse"));

    expect(state.phase).toBe("done");
    expect(state.lanes.map((lane) => lane.source)).toEqual([
      "registry",
      "osv",
      "depsdev",
      "dependents",
      "github",
      "scorecard",
    ]);
    for (const lane of state.lanes) {
      expect(lane.start).not.toBeNull();
      expect(lane.end).toBeGreaterThanOrEqual(lane.start ?? 0);
    }
    expect(state.report?.name).toBe("fastapi");
  });

  it("shows which providers are still running part way through", async () => {
    const events = await fixtureEvents("package-stream-fastapi.sse");

    const state = replay(packageReducer, initialPackageState, events.slice(0, 4));

    expect(state.phase).toBe("streaming");
    expect(state.lanes.find((lane) => lane.source === "registry")?.status).toBe("ok");
    expect(state.lanes.find((lane) => lane.source === "osv")?.status).toBe("running");
    expect(state.lanes.find((lane) => lane.source === "github")?.status).toBe("planned");
  });

  it("treats a stream that closes before the report as incomplete", async () => {
    const events = await fixtureEvents("package-stream-fastapi.sse");
    const partial = replay(packageReducer, initialPackageState, events.slice(0, 5));

    const closed = packageReducer(partial, { type: "closed" });

    expect(closed.phase).toBe("error");
    expect(closed.error?.code).toBe("incomplete");
    expect(closed.lanes).toEqual(partial.lanes);
  });

  it("keeps a finished report when the stream closes and records errors from the API", async () => {
    const done = replay(packageReducer, initialPackageState, await fixtureEvents("package-stream-fastapi.sse"));
    const notFound = packageReducer(initialPackageState, {
      type: "event",
      event: { event: "error", data: { code: "not_found", message: "left-pads was not found on npm" } },
    });

    expect(packageReducer(done, { type: "closed" })).toBe(done);
    expect(notFound.error).toEqual({ code: "not_found", message: "left-pads was not found on npm" });
  });
});
