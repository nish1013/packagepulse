import type {
  PackageReport,
  ProviderEvent,
  ProviderStartEvent,
  ProviderStatus,
  StartEvent,
  StreamError,
} from "@/lib/api/types";
import type { StreamAction } from "@/lib/sse/read-events";

export type LaneStatus = ProviderStatus | "planned" | "running";

export interface Lane {
  source: string;
  status: LaneStatus;
  start: number | null;
  end: number | null;
  cached: boolean;
  httpStatus: number | null;
  reason: string | null;
}

export interface PackageState {
  phase: "connecting" | "streaming" | "done" | "error";
  lanes: Lane[];
  report: PackageReport | null;
  error: StreamError | null;
}

export const DEFAULT_SOURCES = ["registry", "osv", "depsdev", "dependents", "github", "scorecard"];

export const initialPackageState: PackageState = { phase: "connecting", lanes: [], report: null, error: null };

export function plannedLane(source: string): Lane {
  return { source, status: "planned", start: null, end: null, cached: false, httpStatus: null, reason: null };
}

export function packageReducer(state: PackageState, action: StreamAction): PackageState {
  switch (action.type) {
    case "failed":
      return { ...state, phase: "error", error: action.error };
    case "closed":
      if (state.phase === "done" || state.phase === "error") return state;
      return {
        ...state,
        phase: "error",
        error: { code: "incomplete", message: "The stream ended before the report was ready." },
      };
    case "event":
      return applyEvent(state, action.event.event, action.event.data);
  }
}

function applyEvent(state: PackageState, name: string, data: unknown): PackageState {
  switch (name) {
    case "start":
      return { ...state, phase: "streaming", lanes: (data as StartEvent).planned.map(plannedLane) };
    case "provider_start": {
      const event = data as ProviderStartEvent;
      return { ...state, lanes: updateLane(state.lanes, event.source, { status: "running", start: event.t_ms }) };
    }
    case "provider": {
      const event = data as ProviderEvent;
      return {
        ...state,
        lanes: updateLane(state.lanes, event.source, {
          status: event.status,
          start: event.t_start_ms,
          end: event.t_end_ms,
          cached: event.cached,
          httpStatus: event.http_status,
          reason: event.reason,
        }),
      };
    }
    case "report":
      return { ...state, phase: "done", report: data as PackageReport };
    case "error":
      return { ...state, phase: "error", error: data as StreamError };
    default:
      return state;
  }
}

function updateLane(lanes: Lane[], source: string, patch: Partial<Lane>): Lane[] {
  if (!lanes.some((lane) => lane.source === source)) return [...lanes, { ...plannedLane(source), ...patch }];
  return lanes.map((lane) => (lane.source === source ? { ...lane, ...patch } : lane));
}
