"use strict";

const {
  generateSchedulesIcs,
  formatDateTime,
  escapeText,
  foldLine,
} = require("../ical");

describe("escapeText", () => {
  it("escapes backslashes", () => {
    expect(escapeText("C:\\Windows")).toBe("C:\\\\Windows");
  });

  it("escapes newlines", () => {
    expect(escapeText("line 1\nline 2")).toBe("line 1\\nline 2");
  });

  it("escapes commas", () => {
    expect(escapeText("hello, world")).toBe("hello\\, world");
  });

  it("escapes semicolons", () => {
    expect(escapeText("item; separator")).toBe("item\\; separator");
  });

  it("escapes all special characters in a single string", () => {
    expect(escapeText("a\\b\nc,d;e")).toBe("a\\\\b\\nc\\,d\\;e");
  });
});

describe("foldLine", () => {
  it("does not fold lines shorter than 75 octets", () => {
    const shortLine = "A".repeat(70);
    expect(foldLine(shortLine)).toBe(shortLine);
  });

  it("folds lines exactly at 74 octets", () => {
    // 73 chars + 1 more should fold
    const line = "A".repeat(73) + "B";
    const expected = "A".repeat(73) + "\r\n B";
    expect(foldLine(line)).toBe(expected);
  });

  it("folds lines longer than 75 octets multiple times", () => {
    const line = "A".repeat(73) + "B".repeat(73) + "C";
    const expected = "A".repeat(73) + "\r\n " + "B".repeat(72) + "\r\n BC";
    // First line: 73 octets
    // Second line: ' ' (1) + 'B' * 72 = 73 octets
    // Third line: ' ' (1) + 'B' (1) + 'C' (1) = 3 octets
    expect(foldLine(line)).toBe(expected);
  });

  it("correctly handles multi-byte UTF-8 characters without splitting them", () => {
    // Japanese character 'あ' is 3 bytes in UTF-8
    // 24 * 3 = 72 bytes.
    // Adding one more 'あ' (3 bytes) makes it 75 bytes, which is > 73, so it folds.
    const char = "あ";
    const line = char.repeat(24) + "い";
    const expected = char.repeat(24) + "\r\n い";
    expect(foldLine(line)).toBe(expected);
  });

  it("handles empty string", () => {
    expect(foldLine("")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("formats timestamp into iCal UTC format", () => {
    const ts = Date.UTC(2025, 0, 1, 12, 34, 56);
    expect(formatDateTime(ts)).toBe("20250101T123456Z");
  });

  it("handles single digit months and days", () => {
    const ts = Date.UTC(2025, 4, 3, 1, 2, 3);
    expect(formatDateTime(ts)).toBe("20250503T010203Z");
  });
});

describe("generateSchedulesIcs", () => {
  it("generates calendar with schedule metadata", () => {
    const generatedAt = Date.UTC(2025, 0, 1, 12, 0, 0);
    const nextRunAt = Date.UTC(2025, 0, 2, 15, 30, 0);

    const ics = generateSchedulesIcs({
      pageId: "page-123",
      pageTitle: "Weekly Publish",
      schedules: [{
        id: "sched-1",
        strategy: "one_shot",
        nextRunAt,
      }],
      generatedAt,
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("X-WR-CALNAME:Outliner schedules for Weekly Publish");
    expect(ics).toContain("SUMMARY:Outliner publish (one_shot)");
    expect(ics).toContain("X-OUTLINER-STRATEGY:one_shot");
    expect(ics).toContain(`DTSTAMP:${formatDateTime(generatedAt)}`);
    expect(ics).toContain(`DTSTART:${formatDateTime(nextRunAt)}`);
    expect(ics).toContain(
      `DTEND:${formatDateTime(nextRunAt + 30 * 60 * 1000)}`,
    );
  });

  it("folds long calendar name to comply with RFC5545", () => {
    const ics = generateSchedulesIcs({
      pageId: "page-123",
      pageTitle:
        "Publishing roadmap for team alpha with extended descriptive context",
      schedules: [],
    });

    expect(ics).toMatch(
      /X-WR-CALNAME:Outliner schedules for Publishing roadmap/,
    );
    expect(ics).toMatch(/\r\n /);
  });

  it("falls back to pageId when pageTitle is missing", () => {
    const ics = generateSchedulesIcs({
      pageId: "project-456",
      schedules: [],
    });

    expect(ics).toContain("X-WR-CALNAME:Outliner schedules for project-456");
  });

  it("uses default generatedAt if not provided", () => {
    const mockNow = Date.UTC(2025, 5, 15, 10, 0, 0);
    const spy = jest.spyOn(Date, "now").mockReturnValue(mockNow);

    try {
      const ics = generateSchedulesIcs({
        pageId: "project-789",
        schedules: [{
          id: "sched-1",
          strategy: "daily",
          nextRunAt: mockNow,
        }],
      });
      expect(ics).toContain("DTSTAMP:20250615T100000Z");
    } finally {
      spy.mockRestore();
    }
  });
});
