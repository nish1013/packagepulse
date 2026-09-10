import { useEffect, useReducer } from "react";
import { readEvents, readProblem, type StreamAction } from "./read-events";

export interface StreamRequest {
  url: string;
  init?: RequestInit;
}

export function useEventStream<S>(
  request: StreamRequest | null,
  reducer: (state: S, action: StreamAction) => S,
  initialState: S,
): S {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();

    async function run(active: StreamRequest) {
      try {
        const response = await fetch(active.url, { ...active.init, signal: controller.signal });
        if (!response.ok || !response.body) {
          dispatch({ type: "failed", error: await readProblem(response) });
          return;
        }
        for await (const event of readEvents(response.body)) dispatch({ type: "event", event });
        dispatch({ type: "closed" });
      } catch {
        if (controller.signal.aborted) return;
        dispatch({
          type: "failed",
          error: { code: "network_error", message: "The connection dropped before the results finished." },
        });
      }
    }

    void run(request);
    return () => controller.abort();
  }, [request]);

  return state;
}
