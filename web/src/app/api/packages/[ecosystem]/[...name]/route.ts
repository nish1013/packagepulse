import { checkBotId } from "botid/server";
import type { NextRequest } from "next/server";
import { clientIp, forward, problem, proxyConfig } from "@/lib/upstream/forward";
import { apiStreamPath, isValidVersion, parseStreamTarget } from "@/lib/upstream/package-path";

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ecosystem: string; name: string[] }> },
) {
  const { ecosystem, name } = await params;
  const target = parseStreamTarget(ecosystem, name);
  if (!target) return problem(404, "not_found", "Not found");

  const version = request.nextUrl.searchParams.get("version");
  if (version !== null && !isValidVersion(version)) {
    return problem(422, "invalid_version", "Invalid version", "Versions are up to 64 letters, digits and . + ! _ ~ -");
  }

  if ((await checkBotId()).isBot) {
    return problem(403, "bot_detected", "Forbidden", "Automated requests aren't allowed.");
  }

  const config = proxyConfig();
  if (!config) return problem(500, "not_configured", "Not configured", "The API proxy isn't configured.");

  return forward(config, {
    method: "GET",
    path: apiStreamPath(target),
    query: version ? new URLSearchParams({ version }).toString() : "",
    clientIp: clientIp(request.headers),
    signal: request.signal,
  });
}
