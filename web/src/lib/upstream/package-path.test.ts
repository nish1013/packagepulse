import { describe, expect, it } from "vitest";
import {
  apiStreamPath,
  isValidVersion,
  packageHref,
  parsePackageName,
  parseStreamTarget,
} from "./package-path";

describe("parsePackageName", () => {
  it("accepts plain and scoped names", () => {
    expect(parsePackageName("pypi", ["fastapi"])).toEqual({ ecosystem: "pypi", name: "fastapi" });
    expect(parsePackageName("npm", ["@types", "node"])).toEqual({ ecosystem: "npm", name: "@types/node" });
    expect(parsePackageName("npm", ["%40types%2Fnode"])).toEqual({ ecosystem: "npm", name: "@types/node" });
  });

  it("rejects unknown registries, invalid names and extra segments", () => {
    expect(parsePackageName("cargo", ["serde"])).toBeNull();
    expect(parsePackageName("pypi", ["fast api"])).toBeNull();
    expect(parsePackageName("pypi", ["django", "stream"])).toBeNull();
    expect(parsePackageName("npm", ["@types"])).toBeNull();
    expect(parsePackageName("npm", ["a".repeat(215)])).toBeNull();
    expect(parsePackageName("npm", ["%E0%A4%A"])).toBeNull();
  });
});

describe("parseStreamTarget", () => {
  it("reads the stream kind after the package name", () => {
    expect(parseStreamTarget("npm", ["express", "stream"])).toEqual({
      ecosystem: "npm",
      name: "express",
      kind: "stream",
    });
    expect(parseStreamTarget("npm", ["@scope", "stream", "graph"])).toEqual({
      ecosystem: "npm",
      name: "@scope/stream",
      kind: "graph",
    });
  });

  it("rejects anything that isn't a stream or graph", () => {
    expect(parseStreamTarget("npm", ["express"])).toBeNull();
    expect(parseStreamTarget("npm", ["express", "report"])).toBeNull();
    expect(parseStreamTarget("pypi", ["fastapi", "stream", "extra"])).toBeNull();
  });
});

describe("paths", () => {
  it("builds the API path with encoded name segments", () => {
    expect(apiStreamPath({ ecosystem: "npm", name: "@types/node", kind: "stream" })).toBe(
      "/v1/packages/npm/%40types/node/stream",
    );
  });

  it("builds page links with an optional version", () => {
    expect(packageHref({ ecosystem: "npm", name: "@types/node" })).toBe("/npm/@types/node");
    expect(packageHref({ ecosystem: "pypi", name: "fastapi" }, "0.115.0")).toBe("/pypi/fastapi?version=0.115.0");
  });

  it("validates versions", () => {
    expect(isValidVersion("1.0.0-beta.1+build.5")).toBe(true);
    expect(isValidVersion("2!1.0rc1")).toBe(true);
    expect(isValidVersion("1 0")).toBe(false);
    expect(isValidVersion("1".repeat(65))).toBe(false);
  });
});
