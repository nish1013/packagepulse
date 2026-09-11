import type { Metadata } from "next";
import { ScanView } from "@/components/scan-view";
import { scanShare, shareMetadata } from "@/lib/share";

export const metadata: Metadata = {
  title: "Scan a manifest",
  description: scanShare().description,
  ...shareMetadata(scanShare()),
};

export default function ScanPage() {
  return <ScanView />;
}
