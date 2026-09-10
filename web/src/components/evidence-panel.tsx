"use client";

import { useState, type ReactNode } from "react";
import type { PackageReport } from "@/lib/api/types";
import { compactNumber, daysSince, formatAgo } from "@/lib/health/format";

const MAX_ADVISORIES = 6;

export function EvidencePanel({ report }: { report: PackageReport }) {
  const [now] = useState(() => new Date());
  const { repository, dependents, vulnerabilities, scorecard } = report;
  const weakest = scorecard
    ? scorecard.checks
        .filter((check) => check.score >= 0 && check.score < 10)
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
    : [];

  return (
    <section className="rounded-xl border border-line bg-panel p-5" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading" className="text-base font-semibold">
        Evidence
      </h2>
      <dl className="mt-4 grid gap-4 text-sm">
        <Row label="Release">
          <span className="font-mono">{report.version}</span>
          {report.published_at ? (
            <span className="text-ink-2">, released {formatAgo(daysSince(report.published_at, now))}</span>
          ) : null}
          {report.deprecated ? <p className="mt-1 text-ink-2">Deprecated: {report.deprecated}</p> : null}
        </Row>

        <Row label="Repository">
          {repository ? (
            <>
              <a
                href={repository.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-accent hover:underline"
              >
                {repository.name}
              </a>
              <p className="mt-1 text-ink-2">
                {compactNumber(repository.stars)} stars, {compactNumber(repository.open_issues)} open issues
                {repository.pushed_at ? `, last push ${formatAgo(daysSince(repository.pushed_at, now))}` : ""}
                {repository.archived ? ", archived" : ""}
              </p>
            </>
          ) : (
            <span className="text-ink-2">No linked GitHub repository</span>
          )}
        </Row>

        <Row label="Used by">
          {dependents ? (
            <>
              {compactNumber(dependents.total)} packages{" "}
              <span className="text-ink-2">({compactNumber(dependents.direct)} directly)</span>
            </>
          ) : (
            <span className="text-ink-2">No data</span>
          )}
        </Row>

        <Row label="Advisories">
          {vulnerabilities === null ? (
            <span className="text-ink-2">No data</span>
          ) : vulnerabilities.length === 0 ? (
            "None known for this version"
          ) : (
            <ul className="grid gap-1.5">
              {vulnerabilities.slice(0, MAX_ADVISORIES).map((advisory) => (
                <li key={advisory.id}>
                  <a
                    href={advisory.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-accent hover:underline"
                  >
                    {advisory.id}
                  </a>
                  {advisory.summary ? <span className="text-ink-2"> {advisory.summary}</span> : null}
                </li>
              ))}
              {vulnerabilities.length > MAX_ADVISORIES ? (
                <li className="text-ink-3">and {vulnerabilities.length - MAX_ADVISORIES} more</li>
              ) : null}
            </ul>
          )}
        </Row>

        <Row label="Scorecard">
          {scorecard ? (
            <>
              <span className="font-mono">{scorecard.score.toFixed(1)}</span>
              <span className="text-ink-2"> out of 10</span>
              {weakest.length > 0 ? (
                <p className="mt-1 text-ink-2">
                  Weakest checks: {weakest.map((check) => `${check.name} (${check.score})`).join(", ")}
                </p>
              ) : null}
            </>
          ) : (
            <span className="text-ink-2">Not assessed by OpenSSF Scorecard</span>
          )}
        </Row>
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[100px_1fr] sm:gap-4">
      <dt className="text-xs font-medium tracking-wider text-ink-3 uppercase sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
