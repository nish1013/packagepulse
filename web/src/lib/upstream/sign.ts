import { createHash, createHmac, randomBytes } from "node:crypto";

export const SCHEME = "PP1";

export interface SignableRequest {
  method: string;
  path: string;
  query: string;
  clientIp: string;
  body: string | Uint8Array;
}

export interface SignedRequest extends SignableRequest {
  timestamp: string;
  nonce: string;
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function canonicalQuery(query: string): string {
  const pairs = [...new URLSearchParams(query).entries()];
  pairs.sort(([aKey, aValue], [bKey, bValue]) => compare(aKey, bKey) || compare(aValue, bValue));
  return pairs.map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`).join("&");
}

export function canonicalString(request: SignedRequest): string {
  return [
    SCHEME,
    request.timestamp,
    request.nonce,
    request.method.toUpperCase(),
    decodePath(request.path),
    canonicalQuery(request.query),
    request.clientIp,
    createHash("sha256").update(request.body).digest("hex"),
  ].join("\n");
}

export function sign(secret: string, request: SignedRequest): string {
  return `v1=${createHmac("sha256", secret).update(canonicalString(request)).digest("hex")}`;
}

export function signedHeaders(
  secret: string,
  request: SignableRequest,
  now: number = Date.now(),
): Record<string, string> {
  const signed: SignedRequest = {
    ...request,
    timestamp: String(Math.floor(now / 1000)),
    nonce: randomBytes(16).toString("base64url"),
  };
  return {
    "x-pp-timestamp": signed.timestamp,
    "x-pp-nonce": signed.nonce,
    "x-pp-client-ip": signed.clientIp,
    "x-pp-signature": sign(secret, signed),
  };
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
