import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-20 sm:px-8">
      <p className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nothing here</h1>
      <p className="mt-3 max-w-xl text-ink-2">
        Package pages look like <code>/pypi/fastapi</code> or <code>/npm/@types/node</code>.
      </p>
      <Link href="/" className="mt-6 inline-block font-medium text-accent hover:underline">
        Check a package
      </Link>
    </main>
  );
}
