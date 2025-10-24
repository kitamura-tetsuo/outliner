"use strict";

const { generateSchedulesIcs, formatDateTime } = require("../ical");

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
});
