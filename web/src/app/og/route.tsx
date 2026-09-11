import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { SHARE_IMAGE_SIZE, shareCardFor } from "@/lib/share";

const SOURCES = "PyPI · npm · OSV · deps.dev · GitHub · OpenSSF Scorecard";

export function GET(request: NextRequest) {
  const card = shareCardFor(request.nextUrl.searchParams);
  const titleSize = card.title.length > 28 ? 60 : card.title.length > 16 ? 76 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#0b0f14",
          color: "#e6ebf0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width="56" height="56" viewBox="0 0 24 24">
              <rect width="24" height="24" rx="6" fill="#7ea4ff" />
              <path
                d="M4 12.5h3.4l1.9-4.8 3.2 8.6 2.1-5.8 1.4 2h4"
                fill="none"
                stroke="#0b0f14"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ fontSize: 38, fontWeight: 600 }}>PackagePulse</div>
          </div>
          <div style={{ fontSize: 26, color: "#85919c" }}>packagepulse.satharasinghe.com</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 28, color: "#7ea4ff", letterSpacing: 3, textTransform: "uppercase" }}>
            {card.eyebrow}
          </div>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.05, wordBreak: "break-all" }}>
            {card.title}
          </div>
          <div style={{ fontSize: 30, color: "#a3afba", lineHeight: 1.3 }}>{card.subtitle}</div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#85919c",
            borderTop: "2px solid #242e38",
            paddingTop: 28,
          }}
        >
          {SOURCES}
        </div>
      </div>
    ),
    {
      ...SHARE_IMAGE_SIZE,
      headers: { "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800" },
    },
  );
}
