import { describe, expect, it } from "vitest";
import {
    validateScheduleRuleDtstart,
    validateScheduleRuleRRule,
    validateScheduleRuleSql,
    validateScheduleRuleTimezone,
} from "../../src/services/scheduleRuleValidation";

describe("scheduleRuleValidation", () => {
    describe("validateScheduleRuleSql", () => {
        it("should accept valid INSERT ... RETURNING *", () => {
            expect(validateScheduleRuleSql("INSERT INTO my_table (id, val) VALUES (1, 2) RETURNING *").valid).toBe(
                true,
            );
        });

        it("should accept valid WITH ... INSERT ... RETURNING *", () => {
            expect(
                validateScheduleRuleSql(
                    "WITH vars AS (SELECT 1 AS id) INSERT INTO my_table (id) SELECT id FROM vars RETURNING *",
                ).valid,
            ).toBe(true);
        });

        it("should reject SELECT", () => {
            const res = validateScheduleRuleSql("SELECT * FROM my_table");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/must start with INSERT or WITH/i);
        });

        it("should reject multiple statements", () => {
            const res = validateScheduleRuleSql(
                "INSERT INTO t VALUES (1) RETURNING *; INSERT INTO t VALUES (2) RETURNING *;",
            );
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/exactly one statement/i);
        });

        it("should reject if no RETURNING *", () => {
            const res = validateScheduleRuleSql("INSERT INTO t VALUES (1)");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/must end with RETURNING \*/i);
        });
    });

    describe("validateScheduleRuleRRule", () => {
        it("should accept valid HOURLY rrule", () => {
            expect(validateScheduleRuleRRule("FREQ=HOURLY;INTERVAL=2").valid).toBe(true);
        });

        it("should accept valid DAILY rrule", () => {
            expect(validateScheduleRuleRRule("FREQ=DAILY;BYDAY=MO,WE,FR").valid).toBe(true);
        });

        it("should reject MINUTELY rrule", () => {
            const res = validateScheduleRuleRRule("FREQ=MINUTELY;INTERVAL=30");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/HOURLY or coarser/i);
        });

        it("should reject SECONDLY rrule", () => {
            const res = validateScheduleRuleRRule("FREQ=SECONDLY");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/HOURLY or coarser/i);
        });

        it("should reject invalid string", () => {
            const res = validateScheduleRuleRRule("INVALID_RRULE");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Invalid RRULE/i);
        });
    });

    describe("validateScheduleRuleTimezone", () => {
        it("should accept valid IANA timezone", () => {
            expect(validateScheduleRuleTimezone("America/New_York").valid).toBe(true);
            expect(validateScheduleRuleTimezone("UTC").valid).toBe(true);
            expect(validateScheduleRuleTimezone("Asia/Tokyo").valid).toBe(true);
        });

        it("should reject invalid timezone", () => {
            const res = validateScheduleRuleTimezone("Not/Timezone");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/Invalid IANA timezone/i);
        });
    });

    describe("validateScheduleRuleDtstart", () => {
        it("should accept valid local wall-clock datetime", () => {
            expect(validateScheduleRuleDtstart("2026-07-20T09:00:00").valid).toBe(true);
        });

        it("should reject string with Z", () => {
            const res = validateScheduleRuleDtstart("2026-07-20T09:00:00Z");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/local wall-clock/i);
        });

        it("should reject string with offset", () => {
            const res = validateScheduleRuleDtstart("2026-07-20T09:00:00+02:00");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/local wall-clock/i);
        });

        it("should reject invalid date", () => {
            const res = validateScheduleRuleDtstart("invalid-date");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/local wall-clock/i);
        });
    });
});

describe("validateScheduleRuleSql (edge cases)", () => {
    it("rejects empty SQL", () => {
        const res = validateScheduleRuleSql("");
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/empty/i);
    });

    it("rejects SQL with no INSERT statement", () => {
        const res = validateScheduleRuleSql("WITH vars AS (SELECT 1 AS id) SELECT id FROM vars RETURNING *");
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/must contain an INSERT statement/i);
    });

    it("handles null SQL", () => {
        const res = validateScheduleRuleSql(null as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/empty/i);
    });
});

describe("validateScheduleRuleRRule (edge cases)", () => {
    it("rejects empty rrule", () => {
        const res = validateScheduleRuleRRule("");
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/empty/i);
    });

    it("handles null rrule", () => {
        const res = validateScheduleRuleRRule(null as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/empty/i);
    });

    it("accepts string with RRULE: prefix", () => {
        const res = validateScheduleRuleRRule("RRULE:FREQ=DAILY");
        expect(res.valid).toBe(true);
    });
});

describe("validateScheduleRuleTimezone (edge cases)", () => {
    it("rejects empty timezone", () => {
        const res = validateScheduleRuleTimezone("");
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/required/i);
    });

    it("handles null timezone", () => {
        const res = validateScheduleRuleTimezone(null as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/required/i);
    });
});

describe("validateScheduleRuleDtstart (edge cases)", () => {
    it("rejects empty dtstart", () => {
        const res = validateScheduleRuleDtstart("");
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/required/i);
    });

    it("rejects parseWallTime valid but Date invalid", () => {
        const res = validateScheduleRuleDtstart("0000-00-00T00:00:00");
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Invalid dtstart date/i);
    });
});
