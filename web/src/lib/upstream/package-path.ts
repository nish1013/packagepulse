import type { Ecosystem } from "@/lib/api/types";

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i;
const PYPI_NAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
const VERSION = /^[0-9a-z.+!_~-]{1,64}$/i;
const MAX_NAME_LENGTH = 214;
const STREAM_KINDS = ["stream", "graph"] as const;

export type StreamKind = (typeof STREAM_KINDS)[number];

export interface PackageTarget {
  ecosystem: Ecosystem;
  name: string;
}

export interface StreamTarget extends PackageTarget {
  kind: StreamKind;
}

export function isEcosystem(value: string): value is Ecosystem {
  return value === "pypi" || value === "npm";
}

export function isValidName(ecosystem: Ecosystem, name: string): boolean {
  return name.length <= MAX_NAME_LENGTH && (ecosystem === "npm" ? NPM_NAME : PYPI_NAME).test(name);
}

export function isValidVersion(version: string): boolean {
  return VERSION.test(version);
}

export function parsePackageName(ecosystem: string, segments: string[]): PackageTarget | null {
  if (!isEcosystem(ecosystem)) return null;
  const split = splitName(ecosystem, segments);
  if (!split || split.rest.length > 0 || !isValidName(ecosystem, split.name)) return null;
  return { ecosystem, name: split.name };
}

export function parseStreamTarget(ecosystem: string, segments: string[]): StreamTarget | null {
  if (!isEcosystem(ecosystem)) return null;
  const split = splitName(ecosystem, segments);
  if (!split || split.rest.length !== 1 || !isValidName(ecosystem, split.name)) return null;
  const kind = STREAM_KINDS.find((candidate) => candidate === split.rest[0]);
  return kind ? { ecosystem, name: split.name, kind } : null;
}

export function apiStreamPath(target: StreamTarget): string {
  const name = target.name.split("/").map(encodeURIComponent).join("/");
  return `/v1/packages/${target.ecosystem}/${name}/${target.kind}`;
}

export function packageHref(target: PackageTarget, version?: string | null): string {
  const path = `/${target.ecosystem}/${target.name}`;
  return version ? `${path}?version=${encodeURIComponent(version)}` : path;
}

function splitName(ecosystem: Ecosystem, segments: string[]): { name: string; rest: string[] } | null {
  const decoded: string[] = [];
  for (const segment of segments) {
    try {
      decoded.push(decodeURIComponent(segment));
    } catch {
      return null;
    }
  }
  const parts = decoded.join("/").split("/");
  if (parts.some((part) => part === "")) return null;
  const size = ecosystem === "npm" && parts[0].startsWith("@") ? 2 : 1;
  if (parts.length < size) return null;
  return { name: parts.slice(0, size).join("/"), rest: parts.slice(size) };
}
