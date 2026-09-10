import { describe, expect, it, vi } from "vitest";
import { collectEvents, readFixture, streamOf } from "@/test/sse";
import { readEvents, readProblem } from "./read-events";

describe("readEvents", () => {
  it("parses a recorded stream the same way whatever the chunk size", async () => {
    const text = readFixture("package-stream-fastapi.sse");
    const names = [...text.matchAll(/^event: (.+)$/gm)].map((match) => match[1]);

    for (const chunkSize of [1, 7, 64, 100_000]) {
      const events = await collectEvents(streamOf(text, chunkSize));
      expect(events.map((event) => event.event)).toEqual(names);
    }
  });

  it("skips comments, handles CRLF and joins multi-line data", async () => {
    const text = ': ping\r\n\r\nevent: note\r\ndata: {"text":\r\ndata: "café"}\r\n\r\n';

    const events = await collectEvents(streamOf(text, 1));

    expect(events).toEqual([{ event: "note", data: { text: "café" } }]);
  });

  it("drops an unfinished event at the end of the stream", async () => {
    const events = await collectEvents(streamOf('event: a\ndata: 1\n\nevent: b\ndata: {"cut'));

    expect(events).toEqual([{ event: "a", data: 1 }]);
  });

  it("cancels the stream when the reader stops early", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"));
      },
      cancel,
    });

    for await (const event of readEvents(body)) {
      expect(event.event).toBe("a");
      break;
    }

    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
});

describe("readProblem", () => {
  it("reads RFC 9457 problems and falls back for anything else", async () => {
    const problem = new Response('{"code":"rate_limited","title":"Too many requests","detail":"Try again in 9 seconds"}', {
      status: 429,
    });

    expect(await readProblem(problem)).toEqual({ code: "rate_limited", message: "Try again in 9 seconds" });
    expect(await readProblem(new Response("<html>", { status: 502 }))).toEqual({
      code: "http_502",
      message: "The request failed with status 502.",
    });
  });
});
