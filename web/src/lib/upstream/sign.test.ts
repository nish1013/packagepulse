import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalQuery, canonicalString, sign, signedHeaders } from "./sign";

interface Vector {
  name: string;
  secret: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  query: string;
  client_ip: string;
  body: string;
  canonical: string;
  signature: string;
}

const vectors = JSON.parse(
  readFileSync(new URL("../../../../api/tests/fixtures/signature_vectors.json", import.meta.url), "utf8"),
) as Vector[];

describe("sign", () => {
  it.each(vectors.map((vector) => [vector.name, vector] as const))(
    "matches the API for %s",
    (_, vector) => {
      const request = {
        timestamp: vector.timestamp,
        nonce: vector.nonce,
        method: vector.method,
        path: vector.path,
        query: vector.query,
        clientIp: vector.client_ip,
        body: vector.body,
      };

      expect(canonicalString(request)).toBe(vector.canonical);
      expect(sign(vector.secret, request)).toBe(vector.signature);
    },
  );

  it("sorts and percent-encodes the query the same way whatever the input encoding", () => {
    expect(canonicalQuery("b=2&a=x+y")).toBe("a=x%20y&b=2");
    expect(canonicalQuery("a=%28b%29%21")).toBe(canonicalQuery("a=(b)!"));
  });

  it("produces headers that verify against the same request", () => {
    const request = {
      method: "POST",
      path: "/v1/scans",
      query: "",
      clientIp: "198.51.100.7",
      body: '{"manifest":"fastapi"}',
    };

    const headers = signedHeaders("s".repeat(64), request, 1_800_000_000_000);

    expect(headers["x-pp-timestamp"]).toBe("1800000000");
    expect(headers["x-pp-client-ip"]).toBe("198.51.100.7");
    expect(headers["x-pp-signature"]).toBe(
      sign("s".repeat(64), {
        ...request,
        timestamp: headers["x-pp-timestamp"],
        nonce: headers["x-pp-nonce"],
      }),
    );
  });
});
