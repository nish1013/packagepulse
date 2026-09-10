"use client";

import { scaleLinear, scaleSqrt, scaleSymlog } from "d3-scale";
import { useMemo, useState } from "react";
import { BandGlyph } from "@/components/badges";
import type { Band } from "@/lib/api/types";
import { BAND_COLOR, BAND_LABEL, compactNumber, formatAgo } from "@/lib/health/format";
import { useElementWidth } from "@/lib/hooks";
import type { ScanRow } from "@/lib/scan/reducer";
import { RISK_SCORE, STALE_DAYS, placeLabels, riskPoints, type RiskPoint } from "@/lib/scan/risk";

const NARROW_WIDTH = 480;
const MARGIN = { top: 18, right: 14, bottom: 44, left: 34 };
const SCORE_TICKS = [0, 20, 40, 60, 80, 100];
const AGE_TICKS: [number, string][] = [
  [0, "0"],
  [30, "1 mo"],
  [180, "6 mo"],
  [548, "18 mo"],
  [1095, "3 yr"],
  [2190, "6 yr"],
  [3650, "10 yr"],
];
const NARROW_AGE_TICKS = new Set([0, 180, 548, 2190]);
const LEGEND_BANDS: Band[] = ["healthy", "watch", "at_risk"];

export function RiskMap({
  rows,
  selected,
  onSelect,
}: {
  rows: ScanRow[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);
  const [now] = useState(() => new Date());
  const { points, unplotted } = useMemo(() => riskPoints(rows, now), [rows, now]);

  const narrow = width > 0 && width < NARROW_WIDTH;
  const height = narrow ? 280 : 330;
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const maxDays = Math.max(STALE_DAYS * 2, ...points.map((point) => point.days)) * 1.08;
  const x = scaleSymlog().constant(30).domain([0, maxDays]).range([0, innerWidth]);
  const y = scaleLinear().domain([0, 100]).range([innerHeight, 0]);
  const radius = scaleSqrt()
    .domain([0, Math.max(1, ...points.map((point) => point.dependents))])
    .range(narrow ? [4, 12] : [5, 17]);
  const ageTicks = AGE_TICKS.filter(([days]) => days <= maxDays && (!narrow || NARROW_AGE_TICKS.has(days)));
  const active = hovered ?? selected;
  const activePoint = points.find((point) => point.index === active) ?? null;
  const drawOrder = [...points].sort((a, b) => b.dependents - a.dependents);
  const labels = placeLabels(
    points
      .filter((point) => point.band === "at_risk" || point.index === active)
      .map((point) => ({
        index: point.index,
        name: point.name,
        x: x(point.days),
        y: y(point.overall),
        r: radius(point.dependents),
      })),
    innerWidth,
    innerHeight,
  );

  return (
    <div className="mt-4">
      <div ref={ref} className="relative w-full">
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Risk map of ${points.length} packages by score and time since release`}
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              <rect
                x={x(STALE_DAYS)}
                y={y(RISK_SCORE)}
                width={Math.max(0, innerWidth - x(STALE_DAYS))}
                height={innerHeight - y(RISK_SCORE)}
                fill="var(--health-risk)"
                opacity={0.08}
              />
              {SCORE_TICKS.map((tick) => (
                <g key={tick}>
                  <line
                    x1={0}
                    x2={innerWidth}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke="var(--line)"
                    strokeDasharray={tick === 0 ? undefined : "2 4"}
                  />
                  <text x={-8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--ink-3)" className="font-mono">
                    {tick}
                  </text>
                </g>
              ))}
              {ageTicks.map(([days, label]) => (
                <text
                  key={days}
                  x={x(days)}
                  y={innerHeight + 18}
                  textAnchor={days === 0 ? "start" : "middle"}
                  fontSize="11"
                  fill="var(--ink-3)"
                  className="font-mono"
                >
                  {label}
                </text>
              ))}
              <line x1={x(STALE_DAYS)} x2={x(STALE_DAYS)} y1={0} y2={innerHeight} stroke="var(--health-watch)" strokeDasharray="4 4" />
              <line x1={0} x2={innerWidth} y1={y(RISK_SCORE)} y2={y(RISK_SCORE)} stroke="var(--health-watch)" strokeDasharray="4 4" />
              <text x={-MARGIN.left} y={-6} fontSize="11" fill="var(--ink-2)">
                Score
              </text>
              <text x={innerWidth} y={innerHeight + 36} textAnchor="end" fontSize="11" fill="var(--ink-2)">
                Time since the latest release
              </text>

              {drawOrder.map((point) => (
                <Point
                  key={point.index}
                  point={point}
                  cx={x(point.days)}
                  cy={y(point.overall)}
                  r={radius(point.dependents)}
                  active={point.index === active}
                  onHover={setHovered}
                  onSelect={() => onSelect(point.index === selected ? null : point.index)}
                />
              ))}

              {labels.map((label) => (
                <g key={label.index} className="pointer-events-none">
                  {Math.abs(label.y - label.pointY) > 3 ? (
                    <line
                      x1={label.alignEnd ? label.x + 4 : label.x - 4}
                      y1={label.pointY}
                      x2={label.x}
                      y2={label.y}
                      stroke="var(--ink-3)"
                      strokeWidth={1}
                    />
                  ) : null}
                  <text
                    x={label.alignEnd ? label.x - 2 : label.x + 2}
                    y={label.y}
                    dy="0.32em"
                    textAnchor={label.alignEnd ? "end" : "start"}
                    fontSize="12"
                    fill="var(--ink)"
                    stroke="var(--panel)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="font-mono"
                  >
                    {label.name}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        ) : (
          <div style={{ height }} />
        )}

        {activePoint && width > 0 ? (
          <Tooltip
            point={activePoint}
            left={MARGIN.left + x(activePoint.days)}
            top={MARGIN.top + y(activePoint.overall)}
            width={width}
          />
        ) : null}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {LEGEND_BANDS.map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <BandGlyph band={band} size={9} />
            {BAND_LABEL[band]}
          </li>
        ))}
        <li className="text-ink-3">Shaded: no release for 18 months and a score under 60</li>
      </ul>
      {unplotted.length > 0 ? (
        <p className="mt-2 text-xs text-ink-3">
          Not on the map because there is no release date or score:{" "}
          {unplotted.map((row) => row.name).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function Point({
  point,
  cx,
  cy,
  r,
  active,
  onHover,
  onSelect,
}: {
  point: RiskPoint;
  cx: number;
  cy: number;
  r: number;
  active: boolean;
  onHover: (index: number | null) => void;
  onSelect: () => void;
}) {
  return (
    <g
      className="cursor-pointer"
      onMouseEnter={() => onHover(point.index)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
    >
      <circle cx={cx} cy={cy} r={r + 8} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={BAND_COLOR[point.band]}
        fillOpacity={0.85}
        stroke={active ? "var(--ink)" : "var(--panel)"}
        strokeWidth={2}
      />
    </g>
  );
}

function Tooltip({ point, left, top, width }: { point: RiskPoint; left: number; top: number; width: number }) {
  const half = Math.min(104, width / 2);
  const clampedLeft = Math.min(Math.max(left, half), width - half);

  return (
    <div
      className="pointer-events-none absolute z-10 w-52 max-w-full -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
      style={{ left: clampedLeft, top: top - 14 }}
    >
      <p className="flex items-center gap-1.5 font-mono text-[13px] text-ink">
        <BandGlyph band={point.band} size={9} />
        <span className="truncate">{point.name}</span>
      </p>
      <p className="mt-1 text-ink-2">
        Score {point.overall}, released {formatAgo(point.days)}
      </p>
      <p className="text-ink-2">{compactNumber(point.dependents)} dependents</p>
      {point.flag ? <p className="mt-1 text-ink [overflow-wrap:anywhere]">{point.flag.message}</p> : null}
    </div>
  );
}
