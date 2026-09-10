"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { BandGlyph } from "@/components/badges";
import type { Relation } from "@/lib/api/types";
import { NODE_SIZE } from "@/lib/graph/layout";
import type { NodeHealth } from "@/lib/graph/reducer";
import { BAND_COLOR } from "@/lib/health/format";

export type PackageNodeData = {
  name: string;
  version: string;
  relation: Relation;
  health: NodeHealth | null;
};

export type PackageFlowNode = Node<PackageNodeData, "package">;

const HIDDEN_HANDLE = { opacity: 0, pointerEvents: "none" } as const;

export function PackageNode({ data }: NodeProps<PackageFlowNode>) {
  const size = NODE_SIZE[data.relation];
  const handles = (
    <>
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} isConnectable={false} />
    </>
  );

  if (data.relation === "INDIRECT") {
    return (
      <div
        title={`${data.name} ${data.version}`}
        style={{ width: size.width, height: size.height }}
        className="flex cursor-pointer items-center rounded-md border border-line bg-surface-2 px-2 font-mono text-[11px] text-ink-2"
      >
        {handles}
        <span className="truncate">{data.name}</span>
      </div>
    );
  }

  const self = data.relation === "SELF";
  const border = data.health ? BAND_COLOR[data.health.band] : self ? "var(--accent)" : "var(--line-strong)";
  const detail = self
    ? `${data.version}, this package`
    : data.health && data.health.overall !== null
      ? `${data.version}, score ${data.health.overall}`
      : data.version;

  return (
    <div
      title={`${data.name} ${data.version}`}
      style={{ width: size.width, height: size.height, borderColor: border }}
      className={`flex flex-col justify-center rounded-lg border-2 bg-panel px-3 ${self ? "cursor-default" : "cursor-pointer"}`}
    >
      {handles}
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-[13px] text-ink">
        {data.health ? <BandGlyph band={data.health.band} size={8} /> : null}
        <span className="truncate">{data.name}</span>
      </span>
      <span className="truncate font-mono text-[11px] text-ink-3">{detail}</span>
    </div>
  );
}
