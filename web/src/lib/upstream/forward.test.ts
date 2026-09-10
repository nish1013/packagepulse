import { describe, expect, it, vi } from "vitest";
import { clientIp, forward, proxyConfig } from "./forward";
import { sign } from "./sign";

const config = { apiUrl: "https://api.example.test", secret: "s".repeat(64) };

function upstreamReturning(response: Response) {
  return vi.fn<typeof fetch>(async () => response);
}

function sentHeaders(fetchMock: ReturnType<typeof upstreamReturning>): Record<string, string> {
  return fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
}

describe("forward", () => {
  it("signs the request and streams the body back with only safe headers", async () => {
    const fetchMock = upstreamReturning(
      new Response("event: report\ndata: {}\n\n", {
        headers: { "content-type": "text/event-stream", "set-cookie": "a=b", server: "uvicorn" },
      }),
    );

    const response = await forward(
      config,
      {
        method: "GET",
        path: "/v1/packages/npm/%40types/node/stream",
        query: "version=22.5.0",
        clientIp: "203.0.113.9",
      },
      fetchMock,
    );

    const headers = sentHeaders(fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.example.test/v1/packages/npm/%40types/node/stream?version=22.5.0",
    );
    expect(headers["x-pp-client-ip"]).toBe("203.0.113.9");
    expect(headers["x-pp-signature"]).toBe(
      sign(config.secret, {
        timestamp: headers["x-pp-timestamp"],
        nonce: headers["x-pp-nonce"],
        method: "GET",
        path: "/v1/packages/npm/%40types/node/stream",
        query: "version=22.5.0",
        clientIp: "203.0.113.9",
        body: "",
      }),
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("server")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(await response.text()).toBe("event: report\ndata: {}\n\n");
  });

  it("includes the body in the signature for scans", async () => {
    const fetchMock = upstreamReturning(new Response("", { headers: { "content-type": "text/event-stream" } }));
    const body = JSON.stringify({ manifest: "fastapi\n" });

    await forward(config, { method: "POST", path: "/v1/scans", body, clientIp: "::1" }, fetchMock);

    const headers = sentHeaders(fetchMock);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-pp-signature"]).toBe(
      sign(config.secret, {
        timestamp: headers["x-pp-timestamp"],
        nonce: headers["x-pp-nonce"],
        method: "POST",
        path: "/v1/scans",
        query: "",
        clientIp: "::1",
        body,
      }),
    );
  });

  it("passes problem responses through with their retry hint", async () => {
    const fetchMock = upstreamReturning(
      new Response('{"code":"rate_limited"}', {
        status: 429,
        headers: { "content-type": "application/problem+json", "retry-after": "12" },
      }),
    );

    const response = await forward(config, { method: "GET", path: "/v1/x", clientIp: "::1" }, fetchMock);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
  });

  it("reports an unavailable API as a 502", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });

    const response = await forward(config, { method: "GET", path: "/v1/x", clientIp: "::1" }, fetchMock);

    expect(response.status).toBe(502);
    expect(((await response.json()) as { code: string }).code).toBe("api_unavailable");
  });

  it("sends unsigned requests when no secret is configured", async () => {
    const fetchMock = upstreamReturning(new Response("{}"));

    await forward({ ...config, secret: null }, { method: "GET", path: "/v1/x", clientIp: "::1" }, fetchMock);

    expect(sentHeaders(fetchMock)["x-pp-signature"]).toBeUndefined();
  });
});

describe("proxyConfig", () => {
  it("requires a signing secret in production", () => {
    expect(proxyConfig({ PP_API_URL: "https://api.example.test", NODE_ENV: "production" })).toBeNull();
    expect(proxyConfig({ NODE_ENV: "development" })).toBeNull();
    expect(proxyConfig({ PP_API_URL: "http://127.0.0.1:8000/", NODE_ENV: "development" })).toEqual({
      apiUrl: "http://127.0.0.1:8000",
      secret: null,
    });
  });
});

describe("clientIp", () => {
  it("uses the platform-provided address and ignores anything that isn't an IP", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.4" }))).toBe("203.0.113.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "2001:db8::2, 10.0.0.1" }))).toBe("2001:db8::2");
    expect(clientIp(new Headers({ "x-real-ip": "not-an-ip" }))).toBe("127.0.0.1");
  });
});
