import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">PackagePulse</span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col justify-center gap-5 py-16">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Know what you are depending on.
        </h1>
        <p className="max-w-xl text-lg text-ink-2">
          Live health evidence for PyPI and npm packages: known vulnerabilities, release activity,
          repository status and supply-chain checks, gathered from five sources at once.
        </p>
      </main>
    </div>
  );
}
