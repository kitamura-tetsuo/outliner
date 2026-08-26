import { Project } from "$shared/app-schema";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createScheduleRule, updateScheduleRule } from "../../../services/schedule/scheduleRuleService";
import { createGrid, getGridName, GRID_REGISTRY_KEY, renameGrid } from "../../../services/yjstable/gridDocs";
import { createTable, getTableName, renameTable, TABLE_REGISTRY_KEY } from "../../../services/yjstable/tableDocs";
import { store } from "../../../stores/store.svelte";

describe("Objects Manager Requirements", () => {
    let project: Project;

    beforeEach(() => {
        project = Project.createInstance("proj-id");
        store.project = project;
    });

    it("should allow renaming a Table while keeping its ID", () => {
        const tableId = createTable(project.ydoc, "Original Table", "orig_table");

        renameTable(project.ydoc, tableId, "Renamed Table");

        expect(getTableName(project.ydoc, tableId)).toBe("Renamed Table");
        expect(project.ydoc.getMap(TABLE_REGISTRY_KEY).has(tableId)).toBe(true);
    });

    it("should allow renaming a Grid while keeping its ID", () => {
        const gridId = createGrid(project.ydoc, "Original Grid");

        renameGrid(project.ydoc, gridId, "Renamed Grid");

        expect(getGridName(project.ydoc, gridId)).toBe("Renamed Grid");
        expect(project.ydoc.getMap(GRID_REGISTRY_KEY).has(gridId)).toBe(true);
    });

    it("should allow renaming a Schedule while keeping its ID", () => {
        const ruleId = createScheduleRule(project, {
            name: "Original Schedule",
            targetTableId: "table1",
            sql: "SELECT 1",
            rrule: "",
        });

        updateScheduleRule(project, ruleId, { name: "Renamed Schedule" });

        const schedule = project.schedules.get(ruleId) as Y.Map<ScheduleRuleValueType>;
        expect(schedule.get("name")).toBe("Renamed Schedule");
        expect(project.schedules.has(ruleId)).toBe(true);
    });
});
