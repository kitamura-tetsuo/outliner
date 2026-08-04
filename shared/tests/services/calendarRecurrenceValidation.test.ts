import { rrulestr } from "rrule";
import { describe, expect, it, vi } from "vitest";
import {
    validateRecurrenceDtstart,
    validateRecurrenceRRule,
    validateRecurrenceTimezone,
} from "../../src/services/calendarRecurrenceValidation.js";

vi.mock("rrule", async (importOriginal) => {
    const actual = await importOriginal<typeof import("rrule")>();
    return {
        ...actual,
        rrulestr: vi.fn(actual.rrulestr),
    };
});

describe("calendarRecurrenceValidation", () => {
    describe("validateRecurrenceRRule", () => {
        it("accepts a valid RRULE body", () => {
            expect(validateRecurrenceRRule("FREQ=DAILY;COUNT=3").valid).toBe(true);
        });

        it("accepts MINUTELY/SECONDLY — unlike schedule rules, a calendar reminder may be fine-grained", () => {
            expect(validateRecurrenceRRule("FREQ=MINUTELY").valid).toBe(true);
        });

        it("rejects an empty string", () => {
            expect(validateRecurrenceRRule("").valid).toBe(false);
            expect(validateRecurrenceRRule("").error).toMatch(/empty/i);
        });

        it("rejects an unparseable string", () => {
            expect(validateRecurrenceRRule("NOT_A_RULE").valid).toBe(false);
            expect(validateRecurrenceRRule("NOT_A_RULE").error).toMatch(/invalid/i);
        });

        it("handles non-Error objects thrown by rrulestr", () => {
            vi.mocked(rrulestr).mockImplementationOnce(() => {
                throw "Some string error";
            });
            const result = validateRecurrenceRRule("FREQ=DAILY");
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/Some string error/);
        });
    });

    describe("validateRecurrenceTimezone", () => {
        it("accepts a valid IANA timezone", () => {
            expect(validateRecurrenceTimezone("America/New_York").valid).toBe(true);
            expect(validateRecurrenceTimezone("UTC").valid).toBe(true);
        });

        it("rejects an empty or invalid timezone", () => {
            expect(validateRecurrenceTimezone("").valid).toBe(false);
            expect(validateRecurrenceTimezone("Not/Timezone").valid).toBe(false);
        });

        it("handles undefined timezone", () => {
            expect(validateRecurrenceTimezone(undefined as unknown as string).valid).toBe(false);
        });
    });

    describe("validateRecurrenceDtstart", () => {
        it("accepts a local wall-clock datetime", () => {
            expect(validateRecurrenceDtstart("2024-03-01T10:00:00").valid).toBe(true);
        });

        it("rejects a string carrying Z or an offset", () => {
            expect(validateRecurrenceDtstart("2024-03-01T10:00:00Z").valid).toBe(false);
            expect(validateRecurrenceDtstart("2024-03-01T10:00:00+01:00").valid).toBe(false);
        });

        it("rejects an empty or malformed string", () => {
            expect(validateRecurrenceDtstart("").valid).toBe(false);
            expect(validateRecurrenceDtstart("2024-03-01").valid).toBe(false);
        });

        it("handles undefined dtstart", () => {
            expect(validateRecurrenceDtstart(undefined as unknown as string).valid).toBe(false);
        });
    });
});
