import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { cloneScheduleRules, rollbackClonedScheduleRules } from "./scheduleRuleClone";
import { createScheduleRule } from "./scheduleRuleService";

// The demo's daily routine rule, verbatim in shape: a data-modifying CTE that
// writes into one table and reads another (docs/schedule-sql-conventions.md).
const ROUTINE_RULE_SQL = `WITH inserted AS (
    INSERT INTO routine_occurrences (id, template_id, title, cadence, done)
    SELECT t.id, t.id, t.title, t.cadence, false
    FROM routine_templates t
    WHERE t.cadence = 'daily'
    ON CONFLICT (id) DO NOTHING
    RETURNING *
)
SELECT id, template_id, title, cadence, done FROM inserted`;

function project(guid: string): Project {
    return Project.fromDoc(new Y.Doc({ guid }));
}

describe("cloneScheduleRules", () => {
    it("copies a rule switched off, retargeted and with its relations rewritten", () => {
        const source = project("source");
        createScheduleRule(source, {
            name: "Routine Occurrences · daily",
            targetTableId: "source-occurrences",
            sql: ROUTINE_RULE_SQL,
            rrule: "RRULE:FREQ=DAILY",
            dtstart: "2026-01-01T00:00:00",
            timezone: "UTC",
            catchUp: true,
            enabled: true,
            lastRunStatus: "ok",
        });
        const destination = project("destination");

        const result = cloneScheduleRules(
            source,
            destination,
            { "source-occurrences": "destination-occurrences", "source-templates": "destination-templates" },
            new Map([["routine_occurrences", "routine_occurrences_2"], ["routine_templates", "routine_templates_2"]]),
        );

        expect(result.copied).toEqual([
            { sourceTableId: "source-occurrences", ruleName: "Routine Occurrences · daily" },
        ]);
        expect(result.skipped).toEqual([]);
        expect(result.createdRuleIds).toHaveLength(1);

        const copied = destination.schedules.get(result.createdRuleIds[0])!;
        expect(copied.get("enabled")).toBe(false);
        expect(copied.get("targetTableId")).toBe("destination-occurrences");
        expect(copied.get("sql")).toContain("INSERT INTO routine_occurrences_2 (id, template_id");
        expect(copied.get("sql")).toContain("FROM routine_templates_2 t");
        // The recurrence is preserved so enabling the copy replays the same
        // history the source has.
        expect(copied.get("rrule")).toBe("RRULE:FREQ=DAILY");
        expect(copied.get("dtstart")).toBe("2026-01-01T00:00:00");
        expect(copied.get("timezone")).toBe("UTC");
        expect(copied.get("catchUp")).toBe(true);
        // Run history belongs to the source's runs.
        expect(copied.get("lastRunStatus")).toBe(undefined);
    });

    it("ignores rules that target a table this paste did not create", () => {
        const source = project("source-unrelated");
        createScheduleRule(source, {
            targetTableId: "some-other-table",
            sql: ROUTINE_RULE_SQL,
            rrule: "RRULE:FREQ=DAILY",
        });
        const destination = project("destination-unrelated");

        const result = cloneScheduleRules(source, destination, { "source-occurrences": "d" }, new Map());

        expect(result).toEqual({ createdRuleIds: [], copied: [], skipped: [] });
        expect(destination.schedules.size).toBe(0);
    });

    it("reports a rule it cannot rewrite instead of copying something broken", () => {
        const source = project("source-broken");
        createScheduleRule(source, {
            name: "Broken",
            targetTableId: "source-occurrences",
            sql: "INSERT INTO public.routine_occurrences (id) VALUES ('1') RETURNING *",
            rrule: "RRULE:FREQ=DAILY",
        });
        const destination = project("destination-broken");

        const result = cloneScheduleRules(
            source,
            destination,
            { "source-occurrences": "destination-occurrences" },
            new Map([["routine_occurrences", "routine_occurrences_2"]]),
        );

        expect(result.copied).toEqual([]);
        expect(result.skipped).toEqual([{ sourceTableId: "source-occurrences", ruleName: "Broken" }]);
        expect(destination.schedules.size).toBe(0);
    });

    it("reports a rewritten rule the destination would reject", () => {
        const source = project("source-invalid");
        createScheduleRule(source, {
            name: "Read only",
            targetTableId: "source-occurrences",
            sql: "SELECT * FROM routine_occurrences",
            rrule: "RRULE:FREQ=DAILY",
        });
        const destination = project("destination-invalid");

        const result = cloneScheduleRules(
            source,
            destination,
            { "source-occurrences": "destination-occurrences" },
            new Map(),
        );

        expect(result.skipped).toEqual([{ sourceTableId: "source-occurrences", ruleName: "Read only" }]);
        expect(destination.schedules.size).toBe(0);
    });

    it("does not re-read the rules it just created when copying within one project", () => {
        const inPlace = project("in-place");
        createScheduleRule(inPlace, {
            name: "Daily",
            targetTableId: "source-occurrences",
            sql: ROUTINE_RULE_SQL,
            rrule: "RRULE:FREQ=DAILY",
        });

        const result = cloneScheduleRules(
            inPlace,
            inPlace,
            { "source-occurrences": "copy-occurrences" },
            new Map([["routine_occurrences", "routine_occurrences_2"]]),
        );

        expect(result.copied).toHaveLength(1);
        expect(inPlace.schedules.size).toBe(2);
    });

    it("removes the rules it created when the paste is rolled back", () => {
        const source = project("source-rollback");
        createScheduleRule(source, {
            targetTableId: "source-occurrences",
            sql: ROUTINE_RULE_SQL,
            rrule: "RRULE:FREQ=DAILY",
        });
        const destination = project("destination-rollback");

        const result = cloneScheduleRules(
            source,
            destination,
            { "source-occurrences": "destination-occurrences" },
            new Map(),
        );
        expect(destination.schedules.size).toBe(1);

        rollbackClonedScheduleRules(destination.ydoc, result.createdRuleIds);
        expect(destination.schedules.size).toBe(0);
    });
});
