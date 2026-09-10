import type {
  Band,
  GraphDoneEvent,
  GraphEvent,
  NodeHealthEvent,
  StreamError,
} from "@/lib/api/types";
import type { StreamAction } from "@/lib/sse/read-events";

export interface NodeHealth {
  overall: number | null;
  band: Band;
  worstFlag: string | null;
}

export interface GraphState {
  phase: "connecting" | "scoring" | "done" | "error";
  graph: GraphEvent | null;
  health: Record<string, NodeHealth>;
  done: GraphDoneEvent | null;
  error: StreamError | null;
}

export const initialGraphState: GraphState = {
  phase: "connecting",
  graph: null,
  health: {},
  done: null,
  error: null,
};

export function graphReducer(state: GraphState, action: StreamAction): GraphState {
  switch (action.type) {
    case "failed":
      return { ...state, phase: "error", error: action.error };
    case "closed":
      if (state.phase === "done" || state.phase === "error") return state;
      return {
        ...state,
        phase: "error",
        error: { code: "incomplete", message: "The graph stream ended early." },
      };
    case "event":
      return applyEvent(state, action.event.event, action.event.data);
  }
}

function applyEvent(state: GraphState, name: string, data: unknown): GraphState {
  switch (name) {
    case "graph":
      return { ...state, phase: "scoring", graph: data as GraphEvent };
    case "node_health": {
      const event = data as NodeHealthEvent;
      return {
        ...state,
        health: {
          ...state.health,
          [event.id]: { overall: event.overall, band: event.band, worstFlag: event.worst_flag },
        },
      };
    }
    case "done":
      return { ...state, phase: "done", done: data as GraphDoneEvent };
    case "error":
      return { ...state, phase: "error", error: data as StreamError };
    default:
      return state;
  }
}
