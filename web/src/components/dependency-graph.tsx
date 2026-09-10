"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, ReactFlow, type Edge, type NodeTypes } from "@xyflow/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { BandGlyph, BandPill } from "@/components/badges";
import { Notice } from "@/components/notice";
import { PackageNode, type PackageFlowNode } from "@/components/package-node";
import type { Band, Ecosystem, GraphEvent } from "@/lib/api/types";
import { FULL_GRAPH_LIMIT, layoutGraph, visibleGraph } from "@/lib/graph/layout";
import type { GraphState } from "@/lib/graph/reducer";
import { BAND_LABEL } from "@/lib/health/format";
import { useElementWidth } from "@/lib/hooks";
import { packageHref } from "@/lib/upstream/package-path";

const nodeTypes: NodeTypes = { package: PackageNode };
const LEGEND_BANDS: Band[] = ["healthy", "watch", "at_risk", "unknown"];
const NARROW_WIDTH = 640;

export function DependencyGraph({ ecosystem, state }: { ecosystem: Ecosystem; state: GraphState }) {
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const [showIndirect, setShowIndirect] = useState<boolean | null>(null);
  const graph = state.graph;
  const narrow = frameWidth > 0 && frameWidth < NARROW_WIDTH;
  const includeIndirect = showIndirect ?? (graph ? graph.nodes.length <= FULL_GRAPH_LIMIT : false);

  const visible = useMemo(
    () => (graph ? visibleGraph(graph.nodes, graph.edges, includeIndirect) : null),
    [graph, includeIndirect],
  );
  const layout = useMemo(() => (visible ? layoutGraph(visible.nodes, visible.edges) : null), [visible]);

  const flow = useMemo(() => {
    if (!visible || !layout) return null;
    const relations = new Map(visible.nodes.map((node) => [node.id, node.relation]));
    const nodes: PackageFlowNode[] = visible.nodes.map((node) => ({
      id: node.id,
      type: "package",
      position: layout.positions.get(node.id) ?? { x: 0, y: 0 },
      data: { name: node.name, version: node.version, relation: node.relation, health: state.health[node.id] ?? null },
      draggable: false,
      connectable: false,
    }));
    const edges: Edge[] = visible.edges.map((edge) => ({
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      animated: state.phase === "scoring" && relations.get(edge.to) === "DIRECT" && !state.health[edge.to],
    }));
    return { nodes, edges };
  }, [visible, layout, state.health, state.phase]);

  let content: ReactNode;
  if (state.phase === "error" && !graph) {
    content =
      state.error?.code === "not_found" ? null : (
        <Notice title="No dependency graph" tone="info">
          {state.error?.code === "graph_unavailable"
            ? "deps.dev doesn't have a resolved dependency graph for this version."
            : state.error?.message}
        </Notice>
      );
  } else if (!graph || !layout || !flow) {
    content = (
      <div className="grid h-72 place-items-center rounded-xl border border-dashed border-line text-sm text-ink-3">
        Resolving the dependency graph
      </div>
    );
  } else if (graph.nodes.length <= 1) {
    content = (
      <p className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-2">
        {graph.root.name} {graph.root.version} has no dependencies.
      </p>
    );
  } else {
    const height = narrow
      ? Math.round(Math.min(460, Math.max(300, layout.height * 0.4 + 60)))
      : Math.round(Math.min(760, Math.max(360, layout.height * 0.6 + 60)));
    content = (
      <GraphCanvas
        ecosystem={ecosystem}
        state={state}
        graph={graph}
        flow={flow}
        height={height}
        narrow={narrow}
        includeIndirect={includeIndirect}
        onToggleIndirect={setShowIndirect}
      />
    );
  }

  return <div ref={frameRef}>{content}</div>;
}

function GraphCanvas({
  ecosystem,
  state,
  graph,
  flow,
  height,
  narrow,
  includeIndirect,
  onToggleIndirect,
}: {
  ecosystem: Ecosystem;
  state: GraphState;
  graph: GraphEvent;
  flow: { nodes: PackageFlowNode[]; edges: Edge[] };
  height: number;
  narrow: boolean;
  includeIndirect: boolean;
  onToggleIndirect: (value: boolean) => void;
}) {
  const router = useRouter();
  const direct = graph.nodes.filter((node) => node.relation === "DIRECT").length;
  const indirect = graph.nodes.filter((node) => node.relation === "INDIRECT").length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
        <p>
          {graph.root.name} {graph.root.version} pulls in {graph.nodes.length - 1} packages: {direct} direct, {indirect}{" "}
          indirect.
          {graph.truncated ? " Only the first 200 are shown." : ""}
        </p>
        {indirect > 0 ? (
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includeIndirect}
              onChange={(event) => onToggleIndirect(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Show indirect dependencies
          </label>
        ) : null}
      </div>

      {graph.fallback ? (
        <p className="mb-3 text-xs text-ink-3">
          deps.dev hasn&apos;t resolved {graph.requested_version} yet, so this is the graph for {graph.root.version}.
        </p>
      ) : null}

      <div
        className={`overflow-hidden rounded-xl border border-line ${narrow ? "graph-touch-scroll" : ""}`}
        style={{ height }}
      >
        <ReactFlow
          key={includeIndirect ? "all" : "direct"}
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.06, minZoom: narrow ? 0.35 : 0.45 }}
          minZoom={0.15}
          maxZoom={1.75}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          preventScrolling={false}
          zoomOnScroll={false}
          panOnDrag={!narrow}
          zoomOnPinch={!narrow}
          zoomOnDoubleClick={!narrow}
          onNodeClick={(_, node) => {
            if (node.data.relation === "SELF") return;
            router.push(packageHref({ ecosystem, name: node.data.name }, node.data.version));
          }}
        >
          <Background gap={24} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {LEGEND_BANDS.map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <BandGlyph band={band} size={9} />
            {BAND_LABEL[band]}
          </li>
        ))}
        <li className="text-ink-3">
          Grey boxes are indirect dependencies, which aren&apos;t scored.
          {narrow ? " Use the buttons to zoom." : " Drag to move around."}
        </li>
      </ul>

      <DirectList ecosystem={ecosystem} state={state} />
    </>
  );
}

function DirectList({ ecosystem, state }: { ecosystem: Ecosystem; state: GraphState }) {
  const nodes = (state.graph?.nodes ?? [])
    .filter((node) => node.relation === "DIRECT")
    .map((node) => ({ node, health: state.health[node.id] ?? null }))
    .sort((a, b) => (a.health?.overall ?? 101) - (b.health?.overall ?? 101) || a.node.name.localeCompare(b.node.name));

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold">Direct dependencies, lowest score first</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map(({ node, health }) => (
          <li key={node.id}>
            <Link
              href={packageHref({ ecosystem, name: node.name }, node.version)}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:border-line-strong"
            >
              <span className="min-w-0 truncate font-mono">
                {node.name} <span className="text-ink-3">{node.version}</span>
              </span>
              {health ? (
                <BandPill band={health.band} score={health.overall} />
              ) : (
                <span className="shrink-0 text-xs text-ink-3">{state.phase === "scoring" ? "scoring" : "not scored"}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
