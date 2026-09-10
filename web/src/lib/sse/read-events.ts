import type { StreamError } from "@/lib/api/types";

export interface ServerEvent {
  event: string;
  data: unknown;
}

export type StreamAction =
  | { type: "event"; event: ServerEvent }
  | { type: "failed"; error: StreamError }
  | { type: "closed" };

export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        finished = true;
        return;
      }
      buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const event = parseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
  }
}

export async function readProblem(response: Response): Promise<StreamError> {
  const fallback = {
    code: `http_${response.status}`,
    message: `The request failed with status ${response.status}.`,
  };
  try {
    const body = (await response.json()) as { code?: string; title?: string; detail?: string };
    return { code: body.code ?? fallback.code, message: body.detail ?? body.title ?? fallback.message };
  } catch {
    return fallback;
  }
}

function parseBlock(block: string): ServerEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? "" : line.slice(colon + 1);
    const value = raw.startsWith(" ") ? raw.slice(1) : raw;
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length ? { event, data: JSON.parse(data.join("\n")) as unknown } : null;
}
