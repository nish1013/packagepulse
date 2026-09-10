import { SeverityGlyph } from "@/components/badges";
import type { Dimension, PackageReport } from "@/lib/api/types";
import { BAND_COLOR, formatPoints, sourceLabel } from "@/lib/health/format";

const DIMENSIONS = [
  { key: "security", label: "Security", weight: 35 },
  { key: "maintenance", label: "Maintenance", weight: 30 },
  { key: "supply_chain", label: "Supply chain", weight: 20 },
  { key: "community", label: "Community", weight: 15 },
] as const;

export function HealthBreakdown({ report }: { report: PackageReport }) {
  const { scores, flags } = report;

  return (
    <section className="rounded-xl border border-line bg-panel p-5" aria-labelledby="health-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="health-heading" className="text-base font-semibold">
          Health breakdown
        </h2>
        <span className="text-xs text-ink-3">Based on {Math.round(scores.coverage * 100)}% of the evidence</span>
      </div>

      {flags.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {flags.map((flag) => (
            <li
              key={flag.code}
              className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm [overflow-wrap:anywhere]"
            >
              <span className="pt-1">
                <SeverityGlyph severity={flag.severity} />
              </span>
              {flag.message}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="mt-5 grid gap-5">
        {DIMENSIONS.map(({ key, label, weight }) => (
          <DimensionRow key={key} label={label} weight={weight} dimension={scores[key]} />
        ))}
      </ul>
    </section>
  );
}

function DimensionRow({ label, weight, dimension }: { label: string; weight: number; dimension: Dimension }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {label} <span className="ml-1 text-xs font-normal text-ink-3">{weight}% of the score</span>
        </span>
        <span className="font-mono">{dimension.score ?? <span className="text-ink-3">no data</span>}</span>
      </div>
      <div
        className="mt-1.5 h-2 rounded-full bg-surface-2"
        role="meter"
        aria-label={`${label} score`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={dimension.score ?? undefined}
      >
        {dimension.score !== null ? (
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, dimension.score)}%`,
              background: BAND_COLOR[dimension.band],
              transition: "width 700ms ease-out",
            }}
          />
        ) : null}
      </div>
      {dimension.reasons.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {dimension.reasons.map((reason, index) => (
            <li
              key={`${reason.code}-${index}`}
              title={`From ${sourceLabel(reason.source)}`}
              className="inline-flex items-baseline gap-1.5 rounded-md border border-line px-2 py-0.5 text-xs text-ink-2"
            >
              <span className="font-mono text-ink">{formatPoints(reason.points)}</span>
              {reason.message}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
