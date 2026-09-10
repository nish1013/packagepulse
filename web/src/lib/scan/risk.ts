import type { Band, Ecosystem, Flag } from "@/lib/api/types";
import { daysSince, worstFlag } from "@/lib/health/format";
import type { ScanRow } from "./reducer";

export const STALE_DAYS = 548;
export const RISK_SCORE = 60;

export interface RiskPoint {
  index: number;
  ecosystem: Ecosystem;
  name: string;
  dev: boolean;
  days: number;
  overall: number;
  band: Band;
  dependents: number;
  flag: Flag | null;
}

export function riskPoints(rows: ScanRow[], now: Date): { points: RiskPoint[]; unplotted: ScanRow[] } {
  const points: RiskPoint[] = [];
  const unplotted: ScanRow[] = [];
  for (const row of rows) {
    const report = row.report;
    if (!report) continue;
    if (!report.published_at || report.scores.overall === null) {
      unplotted.push(row);
      continue;
    }
    points.push({
      index: row.index,
      ecosystem: row.ecosystem,
      name: row.name,
      dev: row.dev,
      days: daysSince(report.published_at, now),
      overall: report.scores.overall,
      band: report.scores.band,
      dependents: report.dependents?.total ?? 0,
      flag: worstFlag(report.flags),
    });
  }
  return { points, unplotted };
}

export interface LabelTarget {
  index: number;
  name: string;
  x: number;
  y: number;
  r: number;
}

export interface PlacedLabel {
  index: number;
  name: string;
  x: number;
  y: number;
  pointY: number;
  alignEnd: boolean;
  width: number;
}

export function placeLabels(
  targets: LabelTarget[],
  plotWidth: number,
  plotHeight: number,
  lineHeight = 15,
  charWidth = 7.4,
): PlacedLabel[] {
  const labels = targets
    .map((target) => {
      const width = target.name.length * charWidth;
      const alignEnd = target.x + target.r + 6 + width > plotWidth;
      return {
        index: target.index,
        name: target.name,
        x: alignEnd ? target.x - target.r - 6 : target.x + target.r + 6,
        y: target.y,
        pointY: target.y,
        alignEnd,
        width,
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (let i = 1; i < labels.length; i++) {
    for (let j = 0; j < i; j++) {
      if (overlaps(labels[i], labels[j]) && labels[i].y - labels[j].y < lineHeight) {
        labels[i].y = labels[j].y + lineHeight;
      }
    }
  }

  for (let i = labels.length - 1; i >= 0; i--) {
    let limit = plotHeight - lineHeight / 2;
    for (let j = i + 1; j < labels.length; j++) {
      if (overlaps(labels[i], labels[j])) limit = Math.min(limit, labels[j].y - lineHeight);
    }
    labels[i].y = Math.max(lineHeight / 2, Math.min(labels[i].y, limit));
  }

  return labels;
}

function overlaps(a: PlacedLabel, b: PlacedLabel): boolean {
  const [aStart, aEnd] = a.alignEnd ? [a.x - a.width, a.x] : [a.x, a.x + a.width];
  const [bStart, bEnd] = b.alignEnd ? [b.x - b.width, b.x] : [b.x, b.x + b.width];
  return aStart < bEnd && bStart < aEnd;
}

export function riskOrder(rows: ScanRow[]): ScanRow[] {
  const rank = (row: ScanRow) => {
    if (row.status === "pending") return 300;
    if (row.status === "failed") return 200;
    return row.report?.scores.overall ?? 101;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.index - b.index);
}
