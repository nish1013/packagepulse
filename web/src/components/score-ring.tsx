import type { Band } from "@/lib/api/types";
import { BAND_COLOR, BAND_LABEL } from "@/lib/health/format";

const SIZE = 96;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({ score, band, pending }: { score: number | null; band: Band; pending: boolean }) {
  const filled = score === null ? 0 : (score / 100) * CIRCUMFERENCE;
  const label = pending ? "Score pending" : `Overall score ${score ?? "unknown"} out of 100, ${BAND_LABEL[band]}`;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="shrink-0">
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--line)"
        strokeWidth={STROKE}
        strokeDasharray={pending ? "3 5" : undefined}
        className={pending ? "animate-pulse" : undefined}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke={BAND_COLOR[band]}
        strokeWidth={STROKE}
        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
        strokeLinecap={filled > 0 ? "round" : "butt"}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        style={{ transition: "stroke-dasharray 700ms ease-out" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink)"
        fontSize="28"
        fontWeight="500"
        className="font-mono"
      >
        {pending ? "" : (score ?? "–")}
      </text>
    </svg>
  );
}
