import { isIP } from "node:net";
import { signedHeaders } from "./sign";

const PASSED_HEADERS = ["content-type", "cache-control", "retry-after"];

export interface ProxyConfig {
  apiUrl: string;
  secret: string | null;
}

export interface ForwardRequest {
  method: "GET" | "POST";
  path: string;
  query?: string;
  body?: string;
  clientIp: string;
  signal?: AbortSignal;
}

export function proxyConfig(env: Record<string, string | undefined> = process.env): ProxyConfig | null {
  const apiUrl = env.PP_API_URL?.replace(/\/+$/, "");
  const secret = env.PP_SIGNING_SECRET || null;
  if (!apiUrl || (!secret && env.NODE_ENV === "production")) return null;
  return { apiUrl, secret };
}

export function clientIp(headers: Headers): string {
  const candidate = headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : "127.0.0.1";
}

export function problem(status: number, code: string, title: string, detail?: string): Response {
  return new Response(JSON.stringify({ type: "about:blank", title, status, code, detail }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

export async function forward(
  config: ProxyConfig,
  request: ForwardRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const query = request.query ?? "";
  const headers: Record<string, string> = { accept: "text/event-stream, application/json" };
  if (request.body !== undefined) headers["content-type"] = "application/json";
  if (config.secret) {
    Object.assign(
      headers,
      signedHeaders(config.secret, {
        method: request.method,
        path: request.path,
        query,
        clientIp: request.clientIp,
        body: request.body ?? "",
      }),
    );
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${config.apiUrl}${request.path}${query ? `?${query}` : ""}`, {
      method: request.method,
      headers,
      body: request.body,
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    if (request.signal?.aborted) return new Response(null, { status: 499 });
    return problem(502, "api_unavailable", "Service unavailable", "The analysis service didn't respond.");
  }

  const passed = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) passed.set(name, value);
  }
  if (passed.get("content-type")?.startsWith("text/event-stream")) {
    passed.set("cache-control", "no-cache, no-transform");
    passed.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: passed });
}
