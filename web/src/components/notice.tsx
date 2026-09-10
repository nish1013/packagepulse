import type { ReactNode } from "react";
import { BandGlyph } from "@/components/badges";

export function Notice({
  title,
  children,
  tone = "error",
}: {
  title: string;
  children?: ReactNode;
  tone?: "error" | "info";
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className="rounded-xl border border-line bg-panel p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <BandGlyph band={tone === "error" ? "at_risk" : "unknown"} />
        {title}
      </p>
      {children ? <div className="mt-1 pl-[18px] text-ink-2">{children}</div> : null}
    </div>
  );
}

export function SectionHeading({ id, title, detail }: { id: string; title: string; detail?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {detail ? <p className="text-sm text-ink-3">{detail}</p> : null}
    </div>
  );
}
