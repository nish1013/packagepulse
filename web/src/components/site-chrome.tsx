import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-2 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <PulseMark />
          PackagePulse
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          <Link href="/scan" className="rounded-md px-3 py-2 text-ink-2 hover:text-ink">
            <span className="sm:hidden">Scan</span>
            <span className="hidden sm:inline">Scan a manifest</span>
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-ink-3 sm:px-8">
        <p className="max-w-2xl">
          Evidence from PyPI, npm, OSV, deps.dev, GitHub and OpenSSF Scorecard. Scores are a starting point for a
          review, not a verdict.
        </p>
        <a href="https://github.com/nish1013/packagepulse" className="hover:text-ink">
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}

function PulseMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <path
        d="M4 12.5h3.4l1.9-4.8 3.2 8.6 2.1-5.8 1.4 2h4"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
