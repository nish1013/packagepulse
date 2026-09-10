import { BandPill, DevBadge } from "@/components/badges";
import type { ScanState } from "@/lib/scan/reducer";

export function FixFirstList({
  state,
  selected,
  onSelect,
}: {
  state: ScanState;
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  if (!state.summary) {
    return (
      <p className="mt-3 text-sm text-ink-3">
        {state.phase === "error"
          ? "There's no ranking because the scan didn't finish."
          : "The ranking appears once every package has been checked."}
      </p>
    );
  }

  if (state.summary.fix_first.length === 0) {
    return <p className="mt-3 text-sm text-ink-2">Nothing stands out. Every package scored 80 or more with no flags.</p>;
  }

  const indexByName = new Map(state.rows.map((row) => [`${row.ecosystem}:${row.name}`, row.index]));

  return (
    <ol className="mt-3 grid gap-2">
      {state.summary.fix_first.map((entry, rank) => {
        const index = indexByName.get(`${entry.ecosystem}:${entry.name}`) ?? null;
        const active = index !== null && index === selected;
        return (
          <li key={`${entry.ecosystem}:${entry.name}`}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : index)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent ${
                active ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-4 font-mono text-xs text-ink-3">{rank + 1}</span>
                <span className="min-w-0 truncate font-mono text-sm">{entry.name}</span>
                {entry.dev ? <DevBadge /> : null}
                <span className="ml-auto">
                  <BandPill band={entry.band} score={entry.overall} />
                </span>
              </span>
              {entry.reasons.map((reason) => (
                <span key={reason} className="mt-1 block pl-6 text-xs text-ink-2 [overflow-wrap:anywhere]">
                  {reason}
                </span>
              ))}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
