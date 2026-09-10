import { describe, expect, it } from "vitest";
import { fixtureEvents, replay } from "@/test/sse";
import { initialScanState, scanReducer } from "./reducer";
import { STALE_DAYS, placeLabels, riskOrder, riskPoints } from "./risk";

const NOW = new Date("2026-09-10T00:00:00Z");

describe("scanReducer", () => {
  it("fills every row and the summary from a recorded scan", async () => {
    const state = replay(scanReducer, initialScanState, await fixtureEvents("scan-package-json.sse"));

    expect(state.phase).toBe("done");
    expect(state.kind).toBe("package.json");
    expect(state.rows).toHaveLength(7);
    expect(state.completed).toBe(7);
    expect(state.rows.every((row) => row.status === "done")).toBe(true);
    expect(state.summary?.fix_first.map((entry) => entry.name)).toEqual(["request", "left-pad", "tslint", "moment"]);
  });

  it("counts failures and keeps partial results when the stream stops early", async () => {
    const events = await fixtureEvents("scan-package-json.sse");
    const started = replay(scanReducer, initialScanState, events.slice(0, 1));

    const failed = scanReducer(started, {
      type: "event",
      event: {
        event: "package_failed",
        data: { index: 2, ecosystem: "npm", name: "left-pad", dev: false, code: "registry_unavailable" },
      },
    });
    const closed = scanReducer(failed, { type: "closed" });

    expect(failed.completed).toBe(1);
    expect(failed.rows[2]).toMatchObject({ status: "failed", code: "registry_unavailable" });
    expect(closed.phase).toBe("error");
    expect(closed.rows).toEqual(failed.rows);
  });
});

describe("risk map", () => {
  it("places long-unreleased packages past the stale line", async () => {
    const state = replay(scanReducer, initialScanState, await fixtureEvents("scan-package-json.sse"));

    const { points } = riskPoints(state.rows, NOW);

    expect(points).toHaveLength(7);
    expect(points.find((point) => point.name === "left-pad")?.days).toBeGreaterThan(STALE_DAYS);
    expect(points.find((point) => point.name === "request")?.band).toBe("at_risk");
  });

  it("stacks labels for points that sit on top of each other and keeps them inside the plot", () => {
    const labels = placeLabels(
      [
        { index: 0, name: "request", x: 290, y: 200, r: 10 },
        { index: 1, name: "left-pad", x: 292, y: 201, r: 6 },
        { index: 2, name: "tslint", x: 291, y: 199, r: 4 },
        { index: 3, name: "moment", x: 40, y: 20, r: 8 },
      ],
      300,
      210,
    );

    const cluster = labels.filter((label) => label.index !== 3).sort((a, b) => a.y - b.y);
    expect(cluster.every((label) => label.alignEnd)).toBe(true);
    expect(cluster[1].y - cluster[0].y).toBeGreaterThanOrEqual(15);
    expect(cluster[2].y - cluster[1].y).toBeGreaterThanOrEqual(15);
    expect(cluster[2].y).toBeLessThanOrEqual(210);
    expect(labels.find((label) => label.index === 3)).toMatchObject({ y: 20, alignEnd: false });
  });

  it("orders rows from lowest score to highest, with unfinished rows last", async () => {
    const state = replay(scanReducer, initialScanState, (await fixtureEvents("scan-package-json.sse")).slice(0, 3));

    const ordered = riskOrder(state.rows);
    const scores = ordered.filter((row) => row.report).map((row) => row.report?.scores.overall ?? 101);

    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(ordered.at(-1)?.status).toBe("pending");
  });
});
