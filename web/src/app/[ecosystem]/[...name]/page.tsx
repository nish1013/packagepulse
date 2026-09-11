import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageView } from "@/components/package-view";
import { ECOSYSTEM_LABEL } from "@/lib/health/format";
import { packageShare, shareMetadata } from "@/lib/share";
import { isValidVersion, parsePackageName } from "@/lib/upstream/package-path";

interface Props {
  params: Promise<{ ecosystem: string; name: string[] }>;
  searchParams: Promise<{ version?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ecosystem, name } = await params;
  const target = parsePackageName(ecosystem, name);
  if (!target) return {};

  const share = packageShare(target);
  return {
    title: `${target.name} on ${ECOSYSTEM_LABEL[target.ecosystem]}`,
    description: share.description,
    ...shareMetadata(share),
  };
}

export default async function PackagePage({ params, searchParams }: Props) {
  const { ecosystem, name } = await params;
  const target = parsePackageName(ecosystem, name);
  if (!target) notFound();

  const { version } = await searchParams;
  const requested = typeof version === "string" && isValidVersion(version) ? version : null;

  return (
    <PackageView
      key={`${target.ecosystem}/${target.name}@${requested ?? "latest"}`}
      ecosystem={target.ecosystem}
      name={target.name}
      version={requested}
    />
  );
}
