import Link from "next/link";
import { PackageSearch } from "@/components/package-search";
import { EXAMPLE_PACKAGES } from "@/lib/examples";
import { packageHref } from "@/lib/upstream/package-path";

const SOURCES = [
  { name: "PyPI and npm", detail: "Latest version, release date and deprecation notices" },
  { name: "OSV", detail: "Known vulnerabilities in that exact version" },
  { name: "deps.dev", detail: "The resolved dependency graph and how many packages depend on it" },
  { name: "GitHub", detail: "Stars, recent activity and whether the repository is archived" },
  { name: "OpenSSF Scorecard", detail: "Supply-chain checks such as code review and dangerous workflows" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
      <section className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Know what you are depending on.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            Check any PyPI or npm package for known vulnerabilities, release activity, repository status and
            supply-chain risk. The evidence comes from five sources at once, and every point of the score shows its
            reason.
          </p>
          <PackageSearch className="mt-8" />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-3">Try</span>
            {EXAMPLE_PACKAGES.map((example) => (
              <Link
                key={`${example.ecosystem}/${example.name}`}
                href={packageHref(example)}
                className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-[13px] text-ink-2 hover:border-line-strong hover:text-ink"
              >
                {example.name}
              </Link>
            ))}
          </div>
          <p className="mt-10 text-sm text-ink-2">
            Checking a whole project?{" "}
            <Link href="/scan" className="font-medium text-accent hover:underline">
              Scan a requirements.txt or package.json
            </Link>{" "}
            to get a ranked list of what to fix first.
          </p>
        </div>
        <aside aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
            Where the evidence comes from
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {SOURCES.map((source) => (
              <li key={source.name} className="grid gap-1 py-3.5 sm:grid-cols-[148px_1fr] sm:gap-4">
                <span className="text-sm font-medium">{source.name}</span>
                <span className="text-sm text-ink-2">{source.detail}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}
