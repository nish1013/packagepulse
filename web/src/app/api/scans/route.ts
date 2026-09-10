import { checkBotId } from "botid/server";
import type { NextRequest } from "next/server";
import { MAX_MANIFEST_BYTES } from "@/lib/examples";
import { clientIp, forward, problem, proxyConfig } from "@/lib/upstream/forward";

export const maxDuration = 300;

const MAX_BODY_BYTES = 256_000;

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return problem(413, "manifest_too_large", "Manifest too large", "Manifests are limited to 64 KB.");
  }

  let manifest: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new RangeError("body too large");
    manifest = (JSON.parse(raw) as { manifest?: unknown }).manifest;
  } catch {
    return problem(400, "invalid_request", "Invalid request", 'Send JSON like {"manifest": "..."}.');
  }

  if (typeof manifest !== "string" || !manifest.trim()) {
    return problem(422, "empty_manifest", "Empty manifest", "Paste a requirements.txt or package.json.");
  }
  if (new TextEncoder().encode(manifest).length > MAX_MANIFEST_BYTES) {
    return problem(413, "manifest_too_large", "Manifest too large", "Manifests are limited to 64 KB.");
  }

  if ((await checkBotId()).isBot) {
    return problem(403, "bot_detected", "Forbidden", "Automated requests aren't allowed.");
  }

  const config = proxyConfig();
  if (!config) return problem(500, "not_configured", "Not configured", "The API proxy isn't configured.");

  return forward(config, {
    method: "POST",
    path: "/v1/scans",
    body: JSON.stringify({ manifest }),
    clientIp: clientIp(request.headers),
    signal: request.signal,
  });
}
