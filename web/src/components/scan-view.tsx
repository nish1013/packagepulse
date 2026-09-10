"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FixFirstList } from "@/components/fix-first-list";
import { Notice } from "@/components/notice";
import { RiskMap } from "@/components/risk-map";
import { ScanTable } from "@/components/scan-table";
import { EXAMPLE_PACKAGE_JSON, EXAMPLE_REQUIREMENTS, MAX_MANIFEST_BYTES } from "@/lib/examples";
import { formatMs } from "@/lib/health/format";
import { initialScanState, scanReducer, type ScanState } from "@/lib/scan/reducer";
import { useEventStream, type StreamRequest } from "@/lib/sse/use-event-stream";

const SECONDARY_BUTTON =
  "rounded-lg border border-line px-3 py-2 text-sm text-ink-2 hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";

export function ScanView() {
  const [manifest, setManifest] = useState(EXAMPLE_PACKAGE_JSON);
  const [run, setRun] = useState<{ id: number; manifest: string } | null>(null);
  const bytes = new TextEncoder().encode(manifest).length;
  const tooLarge = bytes > MAX_MANIFEST_BYTES;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manifest.trim() || tooLarge) return;
    setRun((previous) => ({ id: (previous?.id ?? 0) + 1, manifest }));
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <p className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">requirements.txt or package.json</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Scan a manifest</h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        Paste a manifest and every dependency is checked at the same time, placed on a risk map and ranked by what
        to fix first. Up to 100 packages.
      </p>

      <form onSubmit={submit} className="mt-6 rounded-xl border border-line bg-panel p-4">
        <label htmlFor="manifest" className="sr-only">
          Manifest
        </label>
        <textarea
          id="manifest"
          value={manifest}
          onChange={(event) => setManifest(event.target.value)}
          spellCheck={false}
          rows={11}
          className="w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed focus-visible:outline-2 focus-visible:outline-accent"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!manifest.trim() || tooLarge}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Scan dependencies
          </button>
          <button type="button" onClick={() => setManifest(EXAMPLE_PACKAGE_JSON)} className={SECONDARY_BUTTON}>
            package.json example
          </button>
          <button type="button" onClick={() => setManifest(EXAMPLE_REQUIREMENTS)} className={SECONDARY_BUTTON}>
            requirements.txt example
          </button>
          <span className={`ml-auto font-mono text-xs ${tooLarge ? "text-health-risk" : "text-ink-3"}`}>
            {(bytes / 1000).toFixed(1)} of 64 KB
          </span>
        </div>
      </form>

      {run ? <ScanResults key={run.id} manifest={run.manifest} /> : null}
    </main>
  );
}

function ScanResults({ manifest }: { manifest: string }) {
  const request = useMemo<StreamRequest>(
    () => ({
      url: "/api/scans",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest }),
      },
    }),
    [manifest],
  );
  const state = useEventStream(request, scanReducer, initialScanState);
  const [selected, setSelected] = useState<number | null>(null);

  if (state.phase === "error" && state.rows.length === 0) {
    return (
      <div className="mt-8">
        <Notice title="The scan didn't start">{state.error?.message}</Notice>
      </div>
    );
  }

  return (
    <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8">
      <ScanProgress state={state} />
      {state.error ? <Notice title="The scan stopped early">{state.error.message}</Notice> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-line bg-panel p-5" aria-labelledby="risk-map-heading">
          <h2 id="risk-map-heading" className="text-base font-semibold">
            Risk map
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            Older releases sit further right and lower scores further down. Larger circles have more dependents.
          </p>
          <RiskMap rows={state.rows} selected={selected} onSelect={setSelected} />
        </section>
        <section className="rounded-xl border border-line bg-panel p-5" aria-labelledby="fix-first-heading">
          <h2 id="fix-first-heading" className="text-base font-semibold">
            Fix first
          </h2>
          <FixFirstList state={state} selected={selected} onSelect={setSelected} />
        </section>
      </div>

      <section aria-labelledby="all-heading">
        <h2 id="all-heading" className="text-base font-semibold">
          All dependencies
        </h2>
        <ScanTable rows={state.rows} selected={selected} onSelect={setSelected} />
      </section>
    </div>
  );
}

function ScanProgress({ state }: { state: ScanState }) {
  const total = state.rows.length;
  const summary = state.summary;
  const percent = total ? (state.completed / total) * 100 : 0;
  const label = summary
    ? `Checked ${summary.checked} of ${summary.total} packages${summary.failed ? `, ${summary.failed} failed` : ""}`
    : total
      ? `Checking ${state.completed} of ${total} packages`
      : "Reading the manifest";

  return (
    <div aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
        <span className="font-medium">{label}</span>
        {summary ? (
          <span className="font-mono text-xs text-ink-2">
            {summary.sequential_ms > summary.elapsed_ms
              ? `${formatMs(summary.elapsed_ms)} at once, ${formatMs(summary.sequential_ms)} one by one${
                  summary.speedup ? `, ${summary.speedup}x faster` : ""
                }`
              : `${formatMs(summary.elapsed_ms)}, answered from cache`}
          </span>
        ) : null}
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={state.completed}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%`, transition: "width 300ms" }} />
      </div>
    </div>
  );
}
