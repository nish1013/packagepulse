import { readFileSync } from "node:fs";
import { readEvents, type ServerEvent, type StreamAction } from "@/lib/sse/read-events";

export function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

export function streamOf(text: string, chunkSize = 23): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

export async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<ServerEvent[]> {
  const events: ServerEvent[] = [];
  for await (const event of readEvents(stream)) events.push(event);
  return events;
}

export function fixtureEvents(name: string): Promise<ServerEvent[]> {
  return collectEvents(streamOf(readFixture(name)));
}

export function replay<S>(reducer: (state: S, action: StreamAction) => S, initial: S, events: ServerEvent[]): S {
  return events.reduce((state, event) => reducer(state, { type: "event", event }), initial);
}
