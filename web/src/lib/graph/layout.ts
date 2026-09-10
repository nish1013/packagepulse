import { graphlib, layout } from "@dagrejs/dagre";
import type { GraphEdge, GraphNode, Relation } from "@/lib/api/types";

export const FULL_GRAPH_LIMIT = 40;

export const NODE_SIZE: Record<Relation, { width: number; height: number }> = {
  SELF: { width: 200, height: 58 },
  DIRECT: { width: 180, height: 50 },
  INDIRECT: { width: 150, height: 30 },
};

export interface VisibleGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hiddenIndirect: number;
}

export interface GraphLayout {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

export function visibleGraph(nodes: GraphNode[], edges: GraphEdge[], includeIndirect: boolean): VisibleGraph {
  const kept = includeIndirect ? nodes : nodes.filter((node) => node.relation !== "INDIRECT");
  const ids = new Set(kept.map((node) => node.id));
  const seen = new Set<string>();
  const keptEdges = edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}`;
    if (edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { nodes: kept, edges: keptEdges, hiddenIndirect: nodes.length - kept.length };
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): GraphLayout {
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 12, ranksep: 90, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { ...NODE_SIZE[node.relation] });
  for (const edge of edges) graph.setEdge(edge.from, edge.to);
  layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  let width = 0;
  let height = 0;
  for (const node of nodes) {
    const placed = graph.node(node.id);
    const size = NODE_SIZE[node.relation];
    const x = placed.x - size.width / 2;
    const y = placed.y - size.height / 2;
    positions.set(node.id, { x, y });
    width = Math.max(width, x + size.width);
    height = Math.max(height, y + size.height);
  }
  return { positions, width, height };
}
