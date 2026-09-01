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
});
