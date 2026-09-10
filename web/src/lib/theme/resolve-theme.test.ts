import { describe, expect, it } from "vitest";
import { nextTheme, readStoredTheme, resolveTheme } from "./resolve-theme";

describe("resolveTheme", () => {
  it("follows the system preference when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the system preference once chosen explicitly", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("nextTheme", () => {
  it("cycles system to light to dark and back", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
});

describe("readStoredTheme", () => {
  it("accepts the three valid values", () => {
    expect(readStoredTheme("light")).toBe("light");
    expect(readStoredTheme("dark")).toBe("dark");
    expect(readStoredTheme("system")).toBe("system");
  });

  it("falls back to system for anything else", () => {
    expect(readStoredTheme(null)).toBe("system");
    expect(readStoredTheme("")).toBe("system");
    expect(readStoredTheme("Dark")).toBe("system");
    expect(readStoredTheme("purple")).toBe("system");
  });
});
