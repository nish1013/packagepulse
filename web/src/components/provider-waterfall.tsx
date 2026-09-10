"use client";

import { scaleLinear, type ScaleLinear } from "d3-scale";
import { formatMs, reasonLabel, sourceLabel } from "@/lib/health/format";
import { useElapsed, useElementWidth } from "@/lib/hooks";
import { DEFAULT_SOURCES, plannedLane, type Lane, type LaneStatus, type PackageState } from "@/lib/package/reducer";

const TOP = 24;
const NARROW_WIDTH = 560;

const LAYOUT = {
  wide: { row: 36, labelWidth: 150, right: 78, barY: 11, ticks: 5 },
  narrow: { row: 46, labelWidth: 0, right: 58, barY: 22, ticks: 3 },
};

type Layout = (typeof LAYOUT)["wide"];

const LANE_COLOR: Record<LaneStatus, string> = {
  planned: "transparent",
  running: "var(--accent)",
  ok: "var(--accent)",
  not_found: "var(--ink-3)",
  failed: "var(--health-risk)",
  timeout: "var(--health-risk)",
  skipped: "transparent",
};

const LEGEND = [
  { label: "Answered", color: "var(--accent)", opacity: 1 },
  { label: "From cache", color: "var(--accent)", opacity: 0.45 },
  { label: "No data", color: "var(--ink-3)", opacity: 1 },
  { label: "Failed or timed out", color: "var(--health-risk)", opacity: 1 },
];

export function ProviderWaterfall({ state }: { state: PackageState }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const streaming = state.phase === "streaming";
  const elapsed = useElapsed(streaming);
  const layout = width > 0 && width < NARROW_WIDTH ? LAYOUT.narrow : LAYOUT.wide;
  const lanes = state.lanes.length ? state.lanes : DEFAULT_SOURCES.map(plannedLane);
  const finished = Math.max(0, ...lanes.map((lane) => lane.end ?? 0));
  const now = streaming ? Math.max(elapsed, finished) : finished;
  const plotWidth = Math.max(120, width - layout.labelWidth - layout.right);
  const x = scaleLinear()
    .domain([0, Math.max(400, now, state.report?.timing.elapsed_ms ?? 0)])
    .range([0, plotWidth])
    .nice();
  const height = TOP + lanes.length * layout.row + 4;
  const timing = state.report?.timing;

  return (
    <div className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div ref={ref} className="w-full">
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={
              timing
                ? `${lanes.length} sources answered in ${formatMs(timing.elapsed_ms)}`
                : "Waiting for sources to answer"
            }
          >
            <g transform={`translate(${layout.labelWidth},0)`}>
              {x.ticks(layout.ticks).map((tick) => (
                <g key={tick} transform={`translate(${x(tick)},0)`}>
                  <line y1={TOP - 6} y2={height} stroke="var(--line)" strokeDasharray={tick === 0 ? undefined : "2 4"} />
                  <text
                    y={12}
                    textAnchor={tick === 0 ? "start" : "middle"}
                    fontSize="11"
                    fill="var(--ink-3)"
                    className="font-mono"
                  >
                    {tick === 0 ? "0" : formatMs(tick)}
                  </text>
                </g>
              ))}
              {streaming ? (
                <line x1={x(now)} x2={x(now)} y1={TOP - 6} y2={height} stroke="var(--accent)" strokeWidth={1.5} />
              ) : null}
            </g>
            {lanes.map((lane, index) => (
              <LaneRow
                key={lane.source}
                lane={lane}
                y={TOP + index * layout.row}
                x={x}
                now={now}
                layout={layout}
                narrow={layout === LAYOUT.narrow}
              />
            ))}
          </svg>
        ) : (
          <div style={{ height }} />
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm" style={{ background: item.color, opacity: item.opacity }} />
            {item.label}
          </li>
        ))}
      </ul>

      {timing ? <Comparison together={timing.elapsed_ms} oneByOne={timing.sequential_ms} /> : null}
    </div>
  );
}

function LaneRow({
  lane,
  y,
  x,
  now,
  layout,
  narrow,
}: {
  lane: Lane;
  y: number;
  x: ScaleLinear<number, number>;
  now: number;
  layout: Layout;
  narrow: boolean;
}) {
  const end = lane.status === "running" ? now : lane.end;
  const hasBar = lane.start !== null && end !== null && lane.status !== "skipped" && lane.status !== "planned";
  const barX = hasBar ? x(lane.start ?? 0) : 0;
  const barWidth = hasBar ? Math.max(3, x(end ?? 0) - barX) : 0;
  const duration = lane.start !== null && lane.end !== null && hasBar ? lane.end - lane.start : null;
  const status = statusText(lane);

  return (
    <g transform={`translate(0,${y})`}>
      <title>{`${sourceLabel(lane.source)}: ${status}${duration !== null ? `, ${formatMs(duration)}` : ""}`}</title>
      {narrow ? (
        <text y={14} fontSize="13" fill="var(--ink)">
          {sourceLabel(lane.source)}
          <tspan fontSize="11" fill="var(--ink-3)">{`  ${status}`}</tspan>
        </text>
      ) : (
        <>
          <text y={15} fontSize="13" fill="var(--ink)">
            {sourceLabel(lane.source)}
          </text>
          <text y={29} fontSize="11" fill="var(--ink-3)">
            {status}
          </text>
        </>
      )}
      <g transform={`translate(${layout.labelWidth},0)`}>
        {hasBar ? (
          <rect
            x={barX}
            y={layout.barY}
            width={barWidth}
            height={narrow ? 10 : 12}
            rx={4}
            fill={LANE_COLOR[lane.status]}
            opacity={lane.cached ? 0.45 : 1}
            className={lane.status === "running" ? "animate-pulse" : undefined}
          />
        ) : null}
        {duration !== null ? (
          <text
            x={barX + barWidth + 6}
            y={layout.barY + (narrow ? 9 : 10)}
            fontSize="11"
            fill="var(--ink-2)"
            className="font-mono"
          >
            {formatMs(duration)}
          </text>
        ) : null}
      </g>
    </g>
  );
}

function statusText(lane: Lane): string {
  switch (lane.status) {
    case "planned":
      return "waiting";
    case "running":
      return "running";
    case "ok":
      return lane.cached ? "answered from cache" : "answered";
    case "not_found":
      return "no data";
    case "failed":
      return "failed";
    case "timeout":
      return "timed out";
    case "skipped":
      return lane.reason ? `skipped, ${reasonLabel(lane.reason)}` : "skipped";
  }
}

function Comparison({ together, oneByOne }: { together: number; oneByOne: number }) {
  if (oneByOne <= together) {
    return (
      <p className="mt-4 border-t border-line pt-4 text-sm text-ink-2">
        Every source answered from cache in <span className="font-mono text-ink">{formatMs(together)}</span>.
      </p>
    );
  }
  const max = Math.max(together, oneByOne, 1);
  const ratio = together > 0 ? oneByOne / together : 0;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm text-ink-2">
        Called at the same time, every source had answered after{" "}
        <span className="font-mono text-ink">{formatMs(together)}</span>. One after another the same calls add up to{" "}
        <span className="font-mono text-ink">{formatMs(oneByOne)}</span>
        {ratio >= 1.1 ? `, ${ratio.toFixed(1)} times as long` : ""}.
      </p>
      <div className="mt-3 grid gap-2 text-xs">
        <ComparisonBar label="At once" value={together} max={max} color="var(--accent)" />
        <ComparisonBar label="One by one" value={oneByOne} max={max} color="var(--ink-3)" />
      </div>
    </div>
  );
}

function ComparisonBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_52px] items-center gap-3">
      <span className="text-ink-2">{label}</span>
      <div className="h-2 rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="text-right font-mono text-ink-2">{formatMs(value)}</span>
    </div>
  );
}
