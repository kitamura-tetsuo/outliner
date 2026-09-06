import { describe, expect, it } from "vitest";
import {
    legacySuccessfulRunAt,
    summarizeScheduleNextRun,
    summarizeScheduleRun,
} from "../../src/services/scheduleStatus";

// The Schedules Manager's status semantics (issue #5290). Every case here is a
// way the three Schedule timestamps could be conflated; the derivation exists
// to keep them apart.
describe("summarizeScheduleRun", () => {
    it("reports a Schedule that has never executed", () => {
        const summary = summarizeScheduleRun({});

        expect(summary.result).toBe("never");
        expect(summary.lastRunStartedAt).toBeUndefined();
        expect(summary.lastSuccessfulRunAt).toBeUndefined();
        expect(summary.startTimeUnrecorded).toBe(false);
    });

    it("reports an execution that has started but not finished", () => {
        const summary = summarizeScheduleRun({
            lastRunStartedAt: "2026-09-01T10:00:00.000Z",
            lastRunStatus: "running",
        });

        expect(summary.result).toBe("running");
        expect(summary.lastRunStartedAt).toBe("2026-09-01T10:00:00.000Z");
        expect(summary.lastSuccessfulRunAt).toBeUndefined();
    });

    it("keeps the earlier success when a later execution fails", () => {
        const summary = summarizeScheduleRun({
            lastRunStartedAt: "2026-09-02T10:00:00.000Z",
            lastRunStatus: "error",
            lastRunError: 'relation "missing" does not exist',
            lastRunAt: "2026-09-02T10:00:05.000Z",
            lastSuccessfulRunAt: "2026-09-01T10:00:05.000Z",
        });

        expect(summary.result).toBe("failed");
        expect(summary.lastRunStartedAt).toBe("2026-09-02T10:00:00.000Z");
        expect(summary.lastSuccessfulRunAt).toBe("2026-09-01T10:00:05.000Z");
        expect(summary.lastRunError).toContain("does not exist");
    });

    it("reports an interrupted execution without crediting a success", () => {
        const summary = summarizeScheduleRun({
            lastRunStartedAt: "2026-09-02T10:00:00.000Z",
            lastRunStatus: "interrupted",
            lastRunError: "the scheduler restarted",
            lastSuccessfulRunAt: "2026-09-01T10:00:05.000Z",
        });

        expect(summary.result).toBe("interrupted");
        expect(summary.lastSuccessfulRunAt).toBe("2026-09-01T10:00:05.000Z");
    });

    it("never promotes the legacy completion timestamp to an execution start", () => {
        // Pre-#5290 data: a completion-time `lastRunAt` and no start observation.
        const summary = summarizeScheduleRun({
            lastRunAt: "2026-08-16T10:00:00.000Z",
            lastRunStatus: "ok",
        });

        expect(summary.lastRunStartedAt).toBeUndefined();
        expect(summary.startTimeUnrecorded).toBe(true);
        // A stored "ok" proves that execution succeeded, so it may be shown as
        // the last successful completion.
        expect(summary.lastSuccessfulRunAt).toBe("2026-08-16T10:00:00.000Z");
    });

    it("invents no successful completion when the legacy run failed", () => {
        const summary = summarizeScheduleRun({
            lastRunAt: "2026-08-16T10:00:00.000Z",
            lastRunStatus: "error",
            lastRunError: "boom",
        });

        expect(summary.result).toBe("failed");
        expect(summary.lastRunStartedAt).toBeUndefined();
        expect(summary.startTimeUnrecorded).toBe(true);
        expect(summary.lastSuccessfulRunAt).toBeUndefined();
    });

    it("prefers a recorded successful completion over the legacy seed", () => {
        expect(
            legacySuccessfulRunAt({
                lastRunAt: "2026-08-16T10:00:00.000Z",
                lastRunStatus: "ok",
                lastSuccessfulRunAt: "2026-09-01T10:00:05.000Z",
            }),
        ).toBeUndefined();
    });
});

describe("summarizeScheduleNextRun", () => {
    it("shows the scheduler's own cursor for an active Schedule", () => {
        expect(summarizeScheduleNextRun({
            enabled: true,
            schedulerState: "active",
            schedulerNextRunAt: "2026-09-06T00:00:00.000Z",
        })).toEqual({ state: "scheduled", nextRunAt: "2026-09-06T00:00:00.000Z" });
    });

    it("shows an overdue cursor exactly as the scheduler holds it", () => {
        // The scheduler is behind (downtime, catch-up): `rrule.after(now)` would
        // report a future occurrence, the cursor reports the overdue one.
        expect(summarizeScheduleNextRun({
            enabled: true,
            schedulerState: "active",
            schedulerNextRunAt: "2020-01-01T00:00:00.000Z",
        })).toEqual({ state: "scheduled", nextRunAt: "2020-01-01T00:00:00.000Z" });
    });

    it("shows no occurrence for a disabled Schedule", () => {
        expect(summarizeScheduleNextRun({
            enabled: false,
            schedulerState: "active",
            schedulerNextRunAt: "2026-09-06T00:00:00.000Z",
        })).toEqual({ state: "disabled" });
    });

    it("waits for the scheduler after a Schedule is re-enabled", () => {
        expect(summarizeScheduleNextRun({ enabled: true, schedulerState: "disabled" }))
            .toEqual({ state: "pending" });
    });

    it("reports exhausted and invalid recurrences instead of a timestamp", () => {
        expect(summarizeScheduleNextRun({ enabled: true, schedulerState: "exhausted" }).state)
            .toBe("completed");
        expect(summarizeScheduleNextRun({ enabled: true, schedulerState: "completed" }).state)
            .toBe("completed");
        expect(summarizeScheduleNextRun({ enabled: true, schedulerState: "invalid" }).state)
            .toBe("invalid");
        expect(summarizeScheduleNextRun({ enabled: true, schedulerState: "orphaned" }).state)
            .toBe("orphaned");
    });

    it("reports unavailable rather than guessing when no scheduler state exists yet", () => {
        expect(summarizeScheduleNextRun({ enabled: true }).state).toBe("unavailable");
        expect(summarizeScheduleNextRun({ enabled: true, schedulerState: "active" }).state)
            .toBe("unavailable");
    });
});
