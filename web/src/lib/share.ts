import type { Metadata } from "next";
import { ECOSYSTEM_LABEL } from "@/lib/health/format";
import { isEcosystem, isValidName, packageHref, type PackageTarget } from "@/lib/upstream/package-path";

export const SITE_URL = "https://packagepulse.satharasinghe.com";
export const SITE_NAME = "PackagePulse";
export const SITE_DESCRIPTION =
  "Live health evidence for PyPI and npm dependencies: vulnerabilities, release activity, repository status and supply-chain checks in one place.";
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

export interface ShareText {
  title: string;
  description: string;
  path: string;
  image: string;
  imageAlt: string;
}

export interface ShareCard {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export function siteShare(): ShareText {
  return {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
    image: "/og",
    imageAlt: "PackagePulse: live health checks for PyPI and npm dependencies",
  };
}

export function scanShare(): ShareText {
  return {
    title: `Scan a manifest · ${SITE_NAME}`,
    description:
      "Paste a requirements.txt or package.json to check every dependency at once and see what to fix first.",
    path: "/scan",
    image: "/og?page=scan",
    imageAlt: "PackagePulse manifest scan",
  };
}

export function packageShare(target: PackageTarget): ShareText {
  const registry = ECOSYSTEM_LABEL[target.ecosystem];
  return {
    title: `${target.name} on ${registry} · ${SITE_NAME}`,
    description: `Health report for ${target.name} on ${registry}: known vulnerabilities, release activity, repository status and supply-chain checks from live sources.`,
    path: packageHref(target),
    image: `/og?${new URLSearchParams({ ecosystem: target.ecosystem, name: target.name })}`,
    imageAlt: `PackagePulse health report for ${target.name} on ${registry}`,
  };
}

export function shareMetadata(share: ShareText): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: share.title,
      description: share.description,
      url: share.path,
      images: [{ url: share.image, ...SHARE_IMAGE_SIZE, alt: share.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: share.title,
      description: share.description,
      images: [{ url: share.image, alt: share.imageAlt }],
    },
  };
}

export function shareCardFor(params: URLSearchParams): ShareCard {
  const ecosystem = params.get("ecosystem") ?? "";
  const name = params.get("name") ?? "";
  if (isEcosystem(ecosystem) && isValidName(ecosystem, name)) {
    return {
      eyebrow: `${ECOSYSTEM_LABEL[ecosystem]} package health`,
      title: name,
      subtitle: "Vulnerabilities, releases, repository and supply-chain checks",
    };
  }
  if (params.get("page") === "scan") {
    return {
      eyebrow: "Manifest scan",
      title: "What should I fix first?",
      subtitle: "Every dependency in a manifest, checked at once and ranked",
    };
  }
  return {
    eyebrow: "PyPI and npm",
    title: "Know what you are depending on.",
    subtitle: "Live evidence from five sources, with the reason behind every point",
  };
}
