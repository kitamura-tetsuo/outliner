import { describe, expect, it } from "vitest";
import {
    validateRecurrenceDtstart,
    validateRecurrenceRRule,
    validateRecurrenceTimezone,
} from "../../src/services/calendarRecurrenceValidation";

describe("calendarRecurrenceValidation", () => {
    describe("validateRecurrenceRRule", () => {
        it("accepts a valid RRULE body", () => {
            expect(validateRecurrenceRRule("FREQ=WEEKLY;BYDAY=MO").valid).toBe(true);
        });

        it("accepts MINUTELY/SECONDLY — unlike schedule rules, a calendar reminder may be fine-grained", () => {
            expect(validateRecurrenceRRule("FREQ=MINUTELY;INTERVAL=30").valid).toBe(true);
        });

        it("rejects an empty string", () => {
            const res = validateRecurrenceRRule("");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/empty/i);
        });

        it("rejects an unparseable string", () => {
            const res = validateRecurrenceRRule("NOT_AN_RRULE");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Invalid RRULE/i);
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
    });

    describe("validateRecurrenceDtstart", () => {
        it("accepts a local wall-clock datetime", () => {
            expect(validateRecurrenceDtstart("2026-08-03T09:00:00").valid).toBe(true);
        });

        it("rejects a string carrying Z or an offset", () => {
            expect(validateRecurrenceDtstart("2026-08-03T09:00:00Z").valid).toBe(false);
            expect(validateRecurrenceDtstart("2026-08-03T09:00:00+02:00").valid).toBe(false);
        });

        it("rejects an empty or malformed string", () => {
            expect(validateRecurrenceDtstart("").valid).toBe(false);
            expect(validateRecurrenceDtstart("not a date").valid).toBe(false);
        });
    });
});
