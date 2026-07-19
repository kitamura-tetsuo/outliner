import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { createScheduleRule, deleteScheduleRule, updateScheduleRule } from "./scheduleRuleService";

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
});
