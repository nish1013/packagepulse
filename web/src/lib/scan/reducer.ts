import type {
  PackageReport,
  ScanFailedEvent,
  ScanPackage,
  ScanPackageEvent,
  ScanStartEvent,
  ScanSummary,
  StreamError,
} from "@/lib/api/types";
import type { StreamAction } from "@/lib/sse/read-events";

export interface ScanRow extends ScanPackage {
  status: "pending" | "done" | "failed";
  report: PackageReport | null;
  code: string | null;
}

export interface ScanState {
  phase: "connecting" | "scanning" | "done" | "error";
  kind: string | null;
  rows: ScanRow[];
  completed: number;
  summary: ScanSummary | null;
  error: StreamError | null;
}

export const initialScanState: ScanState = {
  phase: "connecting",
  kind: null,
  rows: [],
  completed: 0,
  summary: null,
  error: null,
};

export function scanReducer(state: ScanState, action: StreamAction): ScanState {
  switch (action.type) {
    case "failed":
      return { ...state, phase: "error", error: action.error };
    case "closed":
      if (state.phase === "done" || state.phase === "error") return state;
      return {
        ...state,
        phase: "error",
        error: { code: "incomplete", message: "The scan stopped before every package was checked." },
      };
    case "event":
      return applyEvent(state, action.event.event, action.event.data);
  }
}

function applyEvent(state: ScanState, name: string, data: unknown): ScanState {
  switch (name) {
    case "scan_start": {
      const event = data as ScanStartEvent;
      return {
        ...state,
        phase: "scanning",
        kind: event.kind,
        rows: event.packages.map((pkg) => ({ ...pkg, status: "pending", report: null, code: null })),
      };
    }
    case "package": {
      const event = data as ScanPackageEvent;
      return finishRow(state, event.index, { status: "done", report: event.report });
    }
    case "package_failed": {
      const event = data as ScanFailedEvent;
      return finishRow(state, event.index, { status: "failed", code: event.code });
    }
    case "summary":
      return { ...state, phase: "done", summary: data as ScanSummary };
    case "error":
      return { ...state, phase: "error", error: data as StreamError };
    default:
      return state;
  }
}

function finishRow(state: ScanState, index: number, patch: Partial<ScanRow>): ScanState {
  const row = state.rows.find((candidate) => candidate.index === index);
  if (!row || row.status !== "pending") return state;
  return {
    ...state,
    completed: state.completed + 1,
    rows: state.rows.map((candidate) => (candidate.index === index ? { ...candidate, ...patch } : candidate)),
  };
}
