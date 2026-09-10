import type { Band, Severity } from "@/lib/api/types";
import { BAND_COLOR, BAND_LABEL } from "@/lib/health/format";

const SEVERITY_BAND: Record<Severity, Band> = { critical: "at_risk", warning: "watch", info: "unknown" };

export function BandGlyph({ band, size = 10 }: { band: Band; size?: number }) {
  const color = BAND_COLOR[band];
  const common = { width: size, height: size, viewBox: "0 0 10 10", "aria-hidden": true, className: "shrink-0" };
  if (band === "healthy") {
    return (
      <svg {...common}>
        <circle cx="5" cy="5" r="4.5" fill={color} />
      </svg>
    );
  }
  if (band === "watch") {
    return (
      <svg {...common}>
        <path d="M5 0.6 9.6 9.4H0.4Z" fill={color} />
      </svg>
    );
  }
  if (band === "at_risk") {
    return (
      <svg {...common}>
        <path d="M5 0 10 5 5 10 0 5Z" fill={color} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="5" cy="5" r="3.8" fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export function SeverityGlyph({ severity }: { severity: Severity }) {
  return <BandGlyph band={SEVERITY_BAND[severity] ?? "unknown"} />;
}

export function BandPill({ band, score }: { band: Band; score?: number | null }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink">
      <BandGlyph band={band} size={9} />
      {BAND_LABEL[band]}
      {score !== undefined && score !== null ? <span className="font-mono text-ink-2">{score}</span> : null}
    </span>
  );
}

export function DevBadge() {
  return (
    <span className="rounded border border-line px-1 py-px text-[10px] font-medium tracking-wider text-ink-3 uppercase">
      dev
    </span>
  );
}
