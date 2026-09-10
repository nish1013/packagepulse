import { describe, expect, it } from "vitest";
import { compactNumber, daysSince, formatAgo, formatMs, formatPoints, worstFlag } from "./format";

describe("format", () => {
  it("formats counts, durations and score points", () => {
    expect(compactNumber(102_232)).toBe("102.2K");
    expect(compactNumber(81)).toBe("81");
    expect(formatMs(147)).toBe("147 ms");
    expect(formatMs(1325)).toBe("1.3 s");
    expect(formatPoints(34)).toBe("+34");
    expect(formatPoints(-35)).toBe("−35");
  });

  it("describes how long ago something happened", () => {
    const now = new Date("2026-09-10T12:00:00Z");

    expect(daysSince("2026-09-10T01:00:00Z", now)).toBe(0);
    expect(formatAgo(0)).toBe("today");
    expect(formatAgo(1)).toBe("1 day ago");
    expect(formatAgo(46)).toBe("2 months ago");
    expect(formatAgo(daysSince("2018-04-27T00:00:00Z", now))).toBe("8.4 years ago");
  });

  it("picks the most severe flag", () => {
    const flags = [
      { code: "stale", severity: "warning" as const, message: "No release in 2 years" },
      { code: "deprecated", severity: "critical" as const, message: "Deprecated" },
    ];

    expect(worstFlag(flags)?.code).toBe("deprecated");
    expect(worstFlag([])).toBeNull();
  });
});
