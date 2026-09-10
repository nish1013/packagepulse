import { describe, expect, it } from "vitest";
import type { GraphEvent } from "@/lib/api/types";
import { fixtureEvents, replay } from "@/test/sse";
import { layoutGraph, visibleGraph } from "./layout";
import { graphReducer, initialGraphState } from "./reducer";

async function recordedGraph() {
  const events = await fixtureEvents("graph-express.sse");
  const graph = events.find((event) => event.event === "graph")?.data as GraphEvent;
  return { events, graph };
}

describe("graphReducer", () => {
  it("collects the graph and the health of each scored dependency", async () => {
    const { events, graph } = await recordedGraph();

    const state = replay(graphReducer, initialGraphState, events);

    const scored = events.filter((event) => event.event === "node_health").length;
    expect(state.phase).toBe("done");
    expect(state.graph?.nodes).toHaveLength(graph.nodes.length);
    expect(Object.keys(state.health)).toHaveLength(scored);
    expect(state.done?.scored).toBe(scored);
  });

  it("reports a graph that isn't available", () => {
    const state = graphReducer(initialGraphState, {
      type: "event",
      event: { event: "error", data: { code: "graph_unavailable", message: "No graph" } },
    });

    expect(state.phase).toBe("error");
    expect(state.error?.code).toBe("graph_unavailable");
  });
});

describe("visibleGraph", () => {
  it("can hide indirect dependencies and the edges that touch them", async () => {
    const { graph } = await recordedGraph();

    const direct = visibleGraph(graph.nodes, graph.edges, false);

    const ids = new Set(direct.nodes.map((node) => node.id));
    expect(direct.nodes.every((node) => node.relation !== "INDIRECT")).toBe(true);
    expect(direct.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    expect(direct.hiddenIndirect).toBe(graph.nodes.filter((node) => node.relation === "INDIRECT").length);
  });
});

describe("layoutGraph", () => {
  it("places every node with the package on the left of its direct dependencies", async () => {
    const { graph } = await recordedGraph();
    const visible = visibleGraph(graph.nodes, graph.edges, true);

    const { positions, width, height } = layoutGraph(visible.nodes, visible.edges);

    const root = graph.nodes.find((node) => node.relation === "SELF");
    const rootX = positions.get(root?.id ?? "")?.x ?? Number.NaN;
    expect(positions.size).toBe(graph.nodes.length);
    for (const node of graph.nodes.filter((candidate) => candidate.relation === "DIRECT")) {
      expect(positions.get(node.id)?.x).toBeGreaterThan(rootX);
    }
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
