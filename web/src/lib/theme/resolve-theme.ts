import type { Theme } from "./theme";

export const THEME_STORAGE_KEY = "theme";

export function nextTheme(current: Theme): Theme {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

export function readStoredTheme(raw: string | null): Theme {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}
