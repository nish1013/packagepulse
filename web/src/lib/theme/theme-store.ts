import { THEME_STORAGE_KEY, readStoredTheme } from "./resolve-theme";
import type { Theme } from "./theme";

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getTheme(): Theme {
  return readStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function getServerTheme(): Theme {
  return "system";
}

export function setTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  for (const listener of listeners) listener();
}
