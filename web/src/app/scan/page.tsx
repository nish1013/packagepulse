import type { Metadata } from "next";
import { ScanView } from "@/components/scan-view";

export const metadata: Metadata = { title: "Scan a manifest" };

export default function ScanPage() {
  return <ScanView />;
}
