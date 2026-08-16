import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import {
    createScheduleRule,
    deleteScheduleRule,
    summarizeTableSchedules,
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

    it("should correctly summarize table schedules", () => {
        const project = Project.createInstance("Test Project");

        // No rules
        let summary = summarizeTableSchedules(project, "table1");
        expect(summary).toEqual({ total: 0, hasEnabled: false });

        // Rules for another table only
        createScheduleRule(project, {
            targetTableId: "table2",
            sql: "INSERT",
            rrule: "FREQ=DAILY",
            enabled: true,
        });
        summary = summarizeTableSchedules(project, "table1");
        expect(summary).toEqual({ total: 0, hasEnabled: false });

        // One enabled rule
        const ruleId1 = createScheduleRule(project, {
            targetTableId: "table1",
            sql: "INSERT",
            rrule: "FREQ=DAILY",
            enabled: true,
        });
        summary = summarizeTableSchedules(project, "table1");
        expect(summary).toEqual({ total: 1, hasEnabled: true });

        // Several rules all disabled
        updateScheduleRule(project, ruleId1, { enabled: false });
        createScheduleRule(project, {
            targetTableId: "table1",
            sql: "INSERT",
            rrule: "FREQ=DAILY",
            enabled: false,
        });
        summary = summarizeTableSchedules(project, "table1");
        expect(summary).toEqual({ total: 2, hasEnabled: false });

        // Mixed enabled/disabled
        createScheduleRule(project, {
            targetTableId: "table1",
            sql: "INSERT",
            rrule: "FREQ=DAILY",
            enabled: true,
        });
        summary = summarizeTableSchedules(project, "table1");
        expect(summary).toEqual({ total: 3, hasEnabled: true });

        // Rule with enabled unset
        createScheduleRule(project, {
            targetTableId: "table1",
            sql: "INSERT",
            rrule: "FREQ=DAILY",
            enabled: undefined,
        });
        summary = summarizeTableSchedules(project, "table1");
        expect(summary).toEqual({ total: 4, hasEnabled: true }); // treated as enabled by default in createScheduleRule
    });
});
