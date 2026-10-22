import { describe, expect, it } from "vitest";
import {
    parseScheduleSqlIdentifiers,
    resolveScheduleTargetPlaceholder,
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

        it("accepts the Schedule target placeholder without rewriting the submitted SQL", () => {
            const sql = "INSERT INTO {{table}} (id, val) SELECT id, val AS value FROM source RETURNING *";

            expect(validateScheduleRuleSql(sql)).toEqual({ valid: true });
            expect(sql).toContain("{{table}}");
        });

        it("accepts a placeholder after multibyte SQL text without changing the source", () => {
            const sql = "/* 日 */ INSERT INTO {{table}} (id) VALUES ('値') RETURNING *";
            expect(validateScheduleRuleSql(sql)).toEqual({ valid: true });
            expect(sql).toBe("/* 日 */ INSERT INTO {{table}} (id) VALUES ('値') RETURNING *");
        });

        it("should reject SELECT", () => {
            const res = validateScheduleRuleSql("SELECT * FROM my_table");
            expect(res.valid).toBe(false);
            expect(res.error).toMatch(/INSERT/i);
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

        it("requires the outer INSERT and exactly its unqualified wildcard RETURNING", () => {
            expect(
                validateScheduleRuleSql(
                    "WITH x AS (INSERT INTO other VALUES (1) RETURNING *) SELECT * FROM x",
                ).valid,
            ).toBe(false);
            expect(validateScheduleRuleSql("INSERT INTO t VALUES (1) RETURNING t.*").valid).toBe(false);
            expect(validateScheduleRuleSql("INSERT INTO t VALUES (1) RETURNING *, id").valid).toBe(false);
        });

        it("does not treat placeholders in strings or comments as a target", () => {
            expect(validateScheduleRuleSql("INSERT INTO {{table}} VALUES ('{{table}}') RETURNING *").valid).toBe(true);
            expect(validateScheduleRuleSql("SELECT '{{table}}' AS value -- {{table}}").valid).toBe(false);
        });

        it("resolves only scanner-visible target placeholders for transient execution", () => {
            const sql = "/* {{table}} 日 */ INSERT INTO {{table}} (id) VALUES ('{{table}}') RETURNING *";

            expect(resolveScheduleTargetPlaceholder(sql, 'Tasks "daily"')).toBe(
                '/* {{table}} 日 */ INSERT INTO "Tasks ""daily""" (id) VALUES (\'{{table}}\') RETURNING *',
            );
            expect(sql).toContain("INSERT INTO {{table}}");
        });

        it("discovers sources without exposing or colliding with the parser-only target", () => {
            const sql = `/* 日本語 {{table}} */ INSERT INTO {{table}} (id)
                SELECT id FROM U&"d\\0061t\\0061" UESCAPE '\\'
                UNION SELECT id FROM __outliner_schedule_target__
                WHERE '{{table}}' = '{{table}}' RETURNING *`;

            expect(parseScheduleSqlIdentifiers(sql)).toEqual(
                new Set([
                    "insert",
                    "into",
                    "id",
                    "select",
                    "from",
                    "data",
                    "uescape",
                    "union",
                    "where",
                    "returning",
                    "__outliner_schedule_target__",
                ]),
            );
            expect(sql).toContain("INSERT INTO {{table}}");
        });

        it("discovers lexical candidates from malformed concrete SQL without full parse admission", () => {
            const malformedOrderSql = "INSERT INTO tasks (id, order) VALUES ('daily', 1) RETURNING *";
            const identifiers = parseScheduleSqlIdentifiers(malformedOrderSql);
            expect(identifiers).toContain("tasks");
            expect(identifiers).toContain("order");
            expect(validateScheduleRuleSql(malformedOrderSql)).toEqual({
                valid: false,
                error: 'syntax error at or near "order"',
            });
        });

        it("does not require full AST admission to suppress generated {{table}} identifiers", () => {
            const malformedTemplateSql = "INSERT INTO {{table}} (id, order) VALUES ('daily', 1) RETURNING *";
            const identifiers = parseScheduleSqlIdentifiers(malformedTemplateSql);
            expect(identifiers).not.toContain("__outliner_schedule_target__");
            expect(identifiers).toContain("order");
            expect(validateScheduleRuleSql(malformedTemplateSql)).toEqual({
                valid: false,
                error: 'syntax error at or near "order"',
            });
        });

        it("retains concrete and Unicode-escaped INSERT targets", () => {
            expect(parseScheduleSqlIdentifiers("INSERT INTO audit (id) VALUES ('one') RETURNING *")).toContain("audit");
            expect(parseScheduleSqlIdentifiers("INSERT INTO U&\"audit\" (id) VALUES ('one') RETURNING *")).toContain(
                "audit",
            );
            expect(parseScheduleSqlIdentifiers("INSERT INTO U&\"a\\0075dit\" (id) VALUES ('one') RETURNING *"))
                .toContain(
                    "audit",
                );
        });

        it("fails explicitly when an input requires AST decoding but cannot be parsed", () => {
            const malformedUnicodeSql =
                "INSERT INTO {{table}} (id) SELECT id FROM U&\"d\\0061t\\0061\" UESCAPE '\\' WHERE";
            expect(() => parseScheduleSqlIdentifiers(malformedUnicodeSql)).toThrow();
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
        expect(res.error).toMatch(/INSERT|syntax/i);
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
