"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Ecosystem } from "@/lib/api/types";
import { ECOSYSTEM_LABEL } from "@/lib/health/format";
import { packageHref, parsePackageName } from "@/lib/upstream/package-path";

const ECOSYSTEMS: Ecosystem[] = ["pypi", "npm"];

export function PackageSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [ecosystem, setEcosystem] = useState<Ecosystem>("pypi");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = query.trim();
    const target = parsePackageName(ecosystem, name.split("/"));
    if (!target) {
      setError(name ? `"${name}" isn't a valid ${ECOSYSTEM_LABEL[ecosystem]} package name.` : "Enter a package name.");
      return;
    }
    router.push(packageHref(target));
  }

  function change(value: string) {
    setQuery(value);
    setError(null);
    if (value.startsWith("@")) setEcosystem("npm");
  }

  return (
    <form onSubmit={submit} className={className} noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div role="radiogroup" aria-label="Registry" className="flex h-11 shrink-0 rounded-lg border border-line bg-surface-2 p-1">
          {ECOSYSTEMS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={ecosystem === option}
              onClick={() => setEcosystem(option)}
              className={`flex-1 rounded-md px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-accent ${
                ecosystem === option ? "bg-panel font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"
              }`}
            >
              {ECOSYSTEM_LABEL[option]}
            </button>
          ))}
        </div>
        <label htmlFor="package-name" className="sr-only">
          Package name
        </label>
        <input
          id="package-name"
          value={query}
          onChange={(event) => change(event.target.value)}
          placeholder={ecosystem === "npm" ? "express or @types/node" : "fastapi"}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? "package-name-error" : undefined}
          className="h-11 min-w-0 rounded-lg border border-line bg-panel px-3 font-mono text-[15px] sm:flex-1 placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          className="h-11 rounded-lg bg-accent px-5 text-sm font-medium text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Check package
        </button>
      </div>
      {error ? (
        <p id="package-name-error" className="mt-2 text-sm text-health-risk">
          {error}
        </p>
      ) : null}
    </form>
  );
}
