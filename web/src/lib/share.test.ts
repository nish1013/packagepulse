import { describe, expect, it } from "vitest";
import { packageShare, scanShare, shareCardFor, shareMetadata, siteShare } from "./share";

describe("share text", () => {
  it("gives package pages their own title, link and image", () => {
    const share = packageShare({ ecosystem: "npm", name: "@types/node" });

    expect(share.title).toBe("@types/node on npm · PackagePulse");
    expect(share.path).toBe("/npm/@types/node");
    expect(share.image).toBe("/og?ecosystem=npm&name=%40types%2Fnode");
    expect(share.description).toContain("@types/node on npm");
  });

  it("uses the site card for the home page and a scan card for the scan page", () => {
    expect(siteShare()).toMatchObject({ path: "/", image: "/og" });
    expect(scanShare()).toMatchObject({ path: "/scan", image: "/og?page=scan" });
  });

  it("builds Open Graph and Twitter metadata with a large image", () => {
    const metadata = shareMetadata(siteShare());

    expect(metadata.openGraph).toMatchObject({
      siteName: "PackagePulse",
      images: [{ url: "/og", width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("shareCardFor", () => {
  it("shows a valid package name", () => {
    expect(shareCardFor(new URLSearchParams("ecosystem=pypi&name=fastapi"))).toMatchObject({
      eyebrow: "PyPI package health",
      title: "fastapi",
    });
  });

  it("falls back to the site card for anything that isn't a valid package", () => {
    const site = shareCardFor(new URLSearchParams());

    expect(shareCardFor(new URLSearchParams("ecosystem=npm&name=<script>alert(1)</script>"))).toEqual(site);
    expect(shareCardFor(new URLSearchParams("ecosystem=cargo&name=serde"))).toEqual(site);
    expect(shareCardFor(new URLSearchParams("page=scan")).title).toBe("What should I fix first?");
  });
});
