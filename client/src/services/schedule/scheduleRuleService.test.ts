import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { createTable } from "../yjstable/tableDocs";
import {
    createScheduleRule,
    deleteScheduleRule,
    findSchedulesReferencingTable,
    updateScheduleRule,
} from "./scheduleRuleService";

describe("scheduleRuleService", () => {
    it("should create, update, and delete schedule rules", () => {
        const project = Project.createInstance("Test Project");

        // Test creation
        const ruleId = createScheduleRule(project, {
            targetTableId: "table1",
            sql: "INSERT INTO table1 (id) VALUES (1) RETURNING *",
            rrule: "FREQ=DAILY",
        });

        expect(ruleId).toBeDefined();
        const ruleMap = project.schedules.get(ruleId);
        expect(ruleMap).toBeDefined();

        expect(ruleMap?.get("targetTableId")).toBe("table1");
        expect(ruleMap?.get("enabled")).toBe(true);
        expect(ruleMap?.get("catchUp")).toBe(true);
        expect(ruleMap?.get("timezone")).toBeDefined();
        expect(ruleMap?.get("dtstart")).toBeDefined();

        // Test update
        updateScheduleRule(project, ruleId, {
            enabled: false,
            catchUp: false,
            sql: "INSERT INTO table1 (id) VALUES (2) RETURNING *",
        });

        expect(ruleMap?.get("enabled")).toBe(false);
        expect(ruleMap?.get("catchUp")).toBe(false);
        expect(ruleMap?.get("sql")).toBe("INSERT INTO table1 (id) VALUES (2) RETURNING *");

        // Test delete
        deleteScheduleRule(project, ruleId);
        expect(project.schedules.get(ruleId)).toBeUndefined();
    });

    it("accepts and preserves the Schedule target placeholder", () => {
        const project = Project.createInstance("Test Project");
        const sql = "INSERT INTO {{table}} (title, id) VALUES ('test', gen_random_uuid())";

        const ruleId = createScheduleRule(project, {
            targetTableId: "table1",
            sql,
            rrule: "FREQ=DAILY",
        });

        expect(project.schedules.get(ruleId)?.get("sql")).toBe(sql);
    });

    // Issue #5012: a Schedule belongs to the project. Its relationship to a
    // Table is a reference — the Table it writes to, or any Table its SQL
    // names — and the same rule shows up for every Table it touches.
    it("reports the Schedules that reference a Table, by kind", () => {
        const project = Project.createInstance("Test Project");
        const tasksId = createTable(project.ydoc, "Tasks", "tasks");
        const auditId = createTable(project.ydoc, "Audit", "audit");

        expect(findSchedulesReferencingTable(project, tasksId)).toEqual([]);

        // Writes into audit, reads tasks: one rule, two referenced Tables,
        // neither of them its owner.
        const ruleId = createScheduleRule(project, {
            name: "Nightly audit",
            targetTableId: auditId,
            sql: "INSERT INTO audit (id) SELECT id FROM tasks",
            rrule: "FREQ=DAILY",
        });

        expect(findSchedulesReferencingTable(project, auditId)).toEqual([
            { ruleId, ruleName: "Nightly audit", kind: "write-target", enabled: true },
        ]);
        expect(findSchedulesReferencingTable(project, tasksId)).toEqual([
            { ruleId, ruleName: "Nightly audit", kind: "sql-reference", enabled: true },
        ]);

        // A rule against an unrelated Table never appears.
        createScheduleRule(project, {
            name: "Unrelated",
            targetTableId: "some-other-table",
            sql: "INSERT INTO elsewhere (id) VALUES (1)",
            rrule: "FREQ=DAILY",
        });
        expect(findSchedulesReferencingTable(project, tasksId)).toHaveLength(1);

        // Disabling a rule keeps the reference and reports it as off.
        updateScheduleRule(project, ruleId, { enabled: false });
        expect(findSchedulesReferencingTable(project, tasksId)[0].enabled).toBe(false);

        // Deleting the rule removes it from both Tables' reference lists.
        deleteScheduleRule(project, ruleId);
        expect(findSchedulesReferencingTable(project, tasksId)).toEqual([]);
        expect(findSchedulesReferencingTable(project, auditId)).toEqual([]);
    });

    it("names an untitled Schedule rather than reporting an empty reference", () => {
        const project = Project.createInstance("Test Project");
        const tasksId = createTable(project.ydoc, "Tasks", "tasks");
        const ruleId = createScheduleRule(project, {
            targetTableId: tasksId,
            sql: "INSERT INTO tasks (id) VALUES (1)",
            rrule: "FREQ=DAILY",
        });

        expect(findSchedulesReferencingTable(project, tasksId)).toEqual([
            { ruleId, ruleName: "Untitled Schedule", kind: "write-target", enabled: true },
        ]);
    });

    // Execution telemetry belongs to the production scheduler (issue #5290).
    // The Schedule editor saves by spreading the whole rule it is holding, so
    // this is the boundary that has to refuse the scheduler-owned half of that
    // spread — otherwise a snapshot loaded before an execution finished writes
    // itself back over the newer result.
    it("writes a Schedule's configuration without touching its execution telemetry", () => {
        const project = Project.createInstance("Test Project");
        const ruleId = createScheduleRule(project, {
            name: "Nightly audit",
            targetTableId: "table1",
            sql: "INSERT INTO table1 (id) VALUES (1) RETURNING *",
            rrule: "FREQ=DAILY",
        });
        const ruleMap = project.schedules.get(ruleId)!;

        // Execution B, as the scheduler recorded it.
        ruleMap.set("lastRunSeq", 2);
        ruleMap.set("lastRunStartedAt", "2026-09-02T10:00:00.000Z");
        ruleMap.set("lastRunStatus", "ok");
        ruleMap.set("lastRunAt", "2026-09-02T10:00:20.000Z");
        ruleMap.set("lastSuccessfulRunAt", "2026-09-02T10:00:20.000Z");
        ruleMap.set("schedulerState", "active");
        ruleMap.set("schedulerNextRunAt", "2026-09-03T00:00:00.000Z");

        // A save that spreads a snapshot taken while execution A was current.
        updateScheduleRule(
            project,
            ruleId,
            {
                name: "Renamed audit",
                lastRunSeq: 1,
                lastRunStartedAt: "2026-09-01T10:00:00.000Z",
                lastRunStatus: "ok",
                lastRunAt: "2026-09-01T10:00:20.000Z",
                lastSuccessfulRunAt: "2026-09-01T10:00:20.000Z",
                schedulerState: "invalid",
                schedulerNextRunAt: "2026-09-01T00:00:00.000Z",
                completedAt: "2026-09-01T10:00:20.000Z",
                validationError: "stale",
                skippedOccurrences: 7,
                // Typed as configuration; the stale half is what a spread carries.
            } as Parameters<typeof updateScheduleRule>[2],
        );

        expect(ruleMap.get("name")).toBe("Renamed audit");
        expect(ruleMap.get("lastRunSeq")).toBe(2);
        expect(ruleMap.get("lastRunStartedAt")).toBe("2026-09-02T10:00:00.000Z");
        expect(ruleMap.get("lastRunAt")).toBe("2026-09-02T10:00:20.000Z");
        expect(ruleMap.get("lastSuccessfulRunAt")).toBe("2026-09-02T10:00:20.000Z");
        expect(ruleMap.get("schedulerState")).toBe("active");
        expect(ruleMap.get("schedulerNextRunAt")).toBe("2026-09-03T00:00:00.000Z");
        expect(ruleMap.get("completedAt")).toBeUndefined();
        expect(ruleMap.get("validationError")).toBeUndefined();
        expect(ruleMap.get("skippedOccurrences")).toBeUndefined();
    });
});
