import { useEffect, useRef, useState, type RefObject } from "react";

export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export function useElapsed(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    let frame = requestAnimationFrame(function tick(now) {
      startedAt.current ??= now;
      setElapsed(now - startedAt.current);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);

  return elapsed;
}
