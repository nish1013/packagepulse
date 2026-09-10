"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BandPill } from "@/components/badges";
import { DependencyGraph } from "@/components/dependency-graph";
import { EvidencePanel } from "@/components/evidence-panel";
import { HealthBreakdown } from "@/components/health-breakdown";
import { Notice, SectionHeading } from "@/components/notice";
import { ProviderWaterfall } from "@/components/provider-waterfall";
import { ScoreRing } from "@/components/score-ring";
import type { Ecosystem, StreamError } from "@/lib/api/types";
import { graphReducer, initialGraphState } from "@/lib/graph/reducer";
import { ECOSYSTEM_LABEL, daysSince, formatAgo } from "@/lib/health/format";
import { initialPackageState, packageReducer, type PackageState } from "@/lib/package/reducer";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { isValidName, packageHref } from "@/lib/upstream/package-path";

interface Props {
  ecosystem: Ecosystem;
  name: string;
  version: string | null;
}

export function PackageView({ ecosystem, name, version }: Props) {
  const base = `/api/packages/${ecosystem}/${name}`;
  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  const reportRequest = useMemo(() => ({ url: `${base}/stream${query}` }), [base, query]);
  const graphRequest = useMemo(() => ({ url: `${base}/graph${query}` }), [base, query]);
  const report = useEventStream(reportRequest, packageReducer, initialPackageState);
  const graph = useEventStream(graphRequest, graphReducer, initialGraphState);
  const missing = report.error?.code === "not_found";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <PackageHeader ecosystem={ecosystem} name={name} version={version} state={report} />

      {report.error ? (
        <div className="mt-6">
          <PackageError ecosystem={ecosystem} name={name} error={report.error} />
        </div>
      ) : null}

      {missing ? null : (
        <>
          <section className="mt-10" aria-labelledby="sources-heading">
            <SectionHeading
              id="sources-heading"
              title="Sources"
              detail="One bar per upstream call, drawn as each one finishes."
            />
            <ProviderWaterfall state={report} />
          </section>

          {report.report ? (
            <div className="mt-10 grid items-start grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <HealthBreakdown report={report.report} />
              <EvidencePanel report={report.report} />
            </div>
          ) : report.phase !== "error" ? (
            <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" aria-hidden="true">
              <div className="h-80 animate-pulse rounded-xl border border-line bg-panel" />
              <div className="h-80 animate-pulse rounded-xl border border-line bg-panel" />
            </div>
          ) : null}

          <section className="mt-10" aria-labelledby="dependencies-heading">
            <SectionHeading
              id="dependencies-heading"
              title="Dependencies"
              detail="Direct dependencies take the colour of their own health as scores arrive."
            />
            <DependencyGraph ecosystem={ecosystem} state={graph} />
          </section>
        </>
      )}
    </main>
  );
}

function PackageHeader({ ecosystem, name, version, state }: Props & { state: PackageState }) {
  const [now] = useState(() => new Date());
  const report = state.report;

  return (
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">{ECOSYSTEM_LABEL[ecosystem]}</p>
        <h1 className="mt-1 font-mono text-2xl font-medium tracking-tight break-all sm:text-4xl">{name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
          <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-ink">
            {report?.version ?? version ?? "latest"}
          </span>
          {report?.published_at ? <span>released {formatAgo(daysSince(report.published_at, now))}</span> : null}
          {report ? <BandPill band={report.scores.band} /> : null}
          {report?.deprecated ? (
            <span className="rounded-md border border-health-risk px-2 py-0.5 text-xs font-medium text-health-risk">
              Deprecated
            </span>
          ) : null}
        </div>
      </div>
      <ScoreRing
        score={report?.scores.overall ?? null}
        band={report?.scores.band ?? "unknown"}
        pending={!report && state.phase !== "error"}
      />
    </header>
  );
}

function PackageError({ ecosystem, name, error }: { ecosystem: Ecosystem; name: string; error: StreamError }) {
  if (error.code === "not_found") {
    const other: Ecosystem = ecosystem === "pypi" ? "npm" : "pypi";
    return (
      <Notice title={`${name} isn't on ${ECOSYSTEM_LABEL[ecosystem]}`}>
        Check the spelling
        {isValidName(other, name) ? (
          <>
            , or{" "}
            <Link href={packageHref({ ecosystem: other, name })} className="text-accent hover:underline">
              look for it on {ECOSYSTEM_LABEL[other]}
            </Link>
          </>
        ) : null}
        .
      </Notice>
    );
  }
  if (error.code === "rate_limited" || error.code === "too_many_streams") {
    return <Notice title="Too many requests right now">{error.message}</Notice>;
  }
  return <Notice title="The report didn't finish">{error.message}</Notice>;
}
