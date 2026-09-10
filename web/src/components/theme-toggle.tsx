"use client";

import { useEffect, useSyncExternalStore } from "react";
import { nextTheme, resolveTheme } from "@/lib/theme/resolve-theme";
import { getServerTheme, getTheme, setTheme, subscribe } from "@/lib/theme/theme-store";
import type { Theme } from "@/lib/theme/theme";

const LABEL: Record<Theme, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  useEffect(() => {
    const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = resolveTheme(theme, prefersDark);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme(theme))}
      aria-label={`Theme: ${LABEL[theme]}. Tap to change.`}
      title={LABEL[theme]}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-ink-2 hover:border-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Icon theme={theme} />
    </button>
  );
}

function Icon({ theme }: { theme: Theme }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }

  if (theme === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
