"use client";

import Link from "next/link";
import { useState } from "react";
import { BandPill, DevBadge } from "@/components/badges";
import { compactNumber, daysSince, failureLabel, formatAgo, worstFlag } from "@/lib/health/format";
import type { ScanRow } from "@/lib/scan/reducer";
import { riskOrder } from "@/lib/scan/risk";
import { packageHref } from "@/lib/upstream/package-path";

export function ScanTable({
  rows,
  selected,
  onSelect,
}: {
  rows: ScanRow[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const [now] = useState(() => new Date());

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[520px] text-left text-sm sm:min-w-[720px]">
        <thead className="bg-surface-2 text-xs tracking-wider text-ink-3 uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Package</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Version</th>
            <th className="px-3 py-2 font-medium">Health</th>
            <th className="px-3 py-2 font-medium">Latest release</th>
            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Dependents</th>
            <th className="px-3 py-2 font-medium">Top flag</th>
          </tr>
        </thead>
        <tbody>
          {riskOrder(rows).map((row) => {
            const report = row.report;
            const active = row.index === selected;
            return (
              <tr
                key={row.index}
                onClick={() => onSelect(active ? null : row.index)}
                className={`cursor-pointer border-t border-line ${active ? "bg-accent-soft" : "hover:bg-surface-2"}`}
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Link
                      href={packageHref(row)}
                      onClick={(event) => event.stopPropagation()}
                      className="font-mono hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.dev ? <DevBadge /> : null}
                  </span>
                </td>
                <td className="hidden px-3 py-2 font-mono text-ink-2 sm:table-cell">{report?.version ?? ""}</td>
                <td className="px-3 py-2">
                  {row.status === "pending" ? (
                    <span className="text-ink-3">checking</span>
                  ) : row.status === "failed" ? (
                    <span className="text-ink-3">{failureLabel(row.code)}</span>
                  ) : report ? (
                    <BandPill band={report.scores.band} score={report.scores.overall} />
                  ) : null}
                </td>
                <td className="px-3 py-2 text-ink-2">
                  {report?.published_at ? formatAgo(daysSince(report.published_at, now)) : ""}
                </td>
                <td className="hidden px-3 py-2 text-right font-mono text-ink-2 sm:table-cell">
                  {report?.dependents ? compactNumber(report.dependents.total) : ""}
                </td>
                <td className="px-3 py-2 text-ink-2">{report ? (worstFlag(report.flags)?.message ?? "") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
