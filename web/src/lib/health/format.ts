import type { Band, Ecosystem, Flag } from "@/lib/api/types";

export const BAND_LABEL: Record<Band, string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
  unknown: "Unknown",
};

export const BAND_COLOR: Record<Band, string> = {
  healthy: "var(--health-good)",
  watch: "var(--health-watch)",
  at_risk: "var(--health-risk)",
  unknown: "var(--health-unknown)",
};

export const ECOSYSTEM_LABEL: Record<Ecosystem, string> = { pypi: "PyPI", npm: "npm" };

const SOURCE_LABEL: Record<string, string> = {
  registry: "Registry",
  osv: "OSV advisories",
  depsdev: "deps.dev",
  dependents: "Dependents",
  github: "GitHub",
  scorecard: "OpenSSF Scorecard",
};

const REASON_LABEL: Record<string, string> = {
  no_version: "no version found",
  no_repo: "no linked repository",
  deadline: "ran out of time",
};

const FAILURE_LABEL: Record<string, string> = {
  not_found: "not found",
  registry_unavailable: "registry didn't respond",
  deadline: "ran out of time",
};

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason.replaceAll("_", " ");
}

export function failureLabel(code: string | null): string {
  return code ? (FAILURE_LABEL[code] ?? code.replaceAll("_", " ")) : "failed";
}

export function compactNumber(value: number): string {
  return compact.format(value);
}

export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000));
}

export function formatAgo(days: number): string {
  if (days < 1) return "today";
  if (days < 45) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 548) {
    const months = Math.round(days / 30.44);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  return `${(days / 365.25).toFixed(1)} years ago`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}

export function worstFlag(flags: Flag[]): Flag | null {
  return (
    flags.find((flag) => flag.severity === "critical") ??
    flags.find((flag) => flag.severity === "warning") ??
    flags[0] ??
    null
  );
}
