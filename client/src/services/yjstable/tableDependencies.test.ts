import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Project } from "../../../../shared/src/app-schema";
import {
    createScheduleRule,
    findSchedulesReferencingTable,
    scheduleTableReferences,
} from "../schedule/scheduleRuleService";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, listGrids } from "./gridDocs";
import { getTableDependencies, removeTableWithPolicy, removeTableWithPolicyUndoable } from "./tableDependencies";
import { createTable, getTableRegistry } from "./tableDocs";

describe("tableDependencies", () => {
    it("finds direct grid references", () => {
        const project = Project.createInstance("Test");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, { name: "G", query: "SELECT * FROM t" });

        const page = project.addPage("Page 1", "test");
        const item1 = page.items.addNode("test");

        project.ydoc.transact(() => {
            const nodeValue = item1.tree.getNodeValueFromKey(item1.key) as Y.Map<unknown>;
            nodeValue.set("componentType", "yjstable");
            nodeValue.set("yjsGridId", gridId);
        });

        const deps = getTableDependencies(project, tableId);
        expect(deps.directGridReferences).toHaveLength(1);
        expect(deps.directGridReferences[0].pageId).toBe(page.id);
        expect(deps.directGridReferences[0].itemId).toBe(item1.id);
        expect(deps.directGridReferences[0].gridId).toBe(gridId);
        expect(deps.dependentGridIds).toEqual([gridId]);
    });

    it("removes table keeping references", () => {
        const project = Project.createInstance("Test");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, { name: "G", query: "SELECT * FROM t" });

        const page = project.addPage("Page 1", "test");
        const item1 = page.items.addNode("test");

        let nodeValue: Y.Map<unknown>;
        project.ydoc.transact(() => {
            nodeValue = item1.tree.getNodeValueFromKey(item1.key) as Y.Map<unknown>;
            nodeValue.set("componentType", "yjstable");
            nodeValue.set("yjsGridId", gridId);
        });

        const res = removeTableWithPolicy(project, tableId, "keep-references");
        expect(res?.detachedGridCount).toBe(0);
        expect(res?.deletedGridCount).toBe(0);

        // Registry entry gone
        expect(getTableRegistry(project.ydoc).has(tableId)).toBe(false);
        // Direct reference remains; the Grid definition also remains but is
        // now orphaned (its source Table has been deleted).
        expect(nodeValue!.get("componentType")).toBe("yjstable");
        expect(nodeValue!.get("yjsGridId")).toBe(gridId);
        expect(listGrids(project.ydoc).map(g => g.gridId)).toContain(gridId);
    });

    it("keeps placeholder Schedule source references inspectable after deleting its target", () => {
        const project = Project.createInstance("Test");
        const targetId = createTable(project.ydoc, "Tasks", "tasks");
        const sourceId = createTable(project.ydoc, "Audit", "audit");
        const sql = "INSERT INTO {{table}} (id) SELECT id FROM audit RETURNING *";
        const ruleId = createScheduleRule(project, { targetTableId: targetId, sql, rrule: "FREQ=DAILY" });

        removeTableWithPolicy(project, targetId, "keep-references");

        expect(getTableRegistry(project.ydoc).has(targetId)).toBe(false);
        expect(project.schedules.get(ruleId)?.get("sql")).toBe(sql);
        expect(scheduleTableReferences(project, ruleId)).toEqual([
            { tableId: targetId, kind: "write-target" },
            { tableId: sourceId, kind: "sql-reference" },
        ]);
        expect(findSchedulesReferencingTable(project, sourceId)).toEqual([
            { ruleId, ruleName: "Untitled Schedule", kind: "sql-reference", enabled: true },
        ]);
    });

    it("retains Schedule reference and indirect warning when concrete target is changed without changing SQL", () => {
        const project = Project.createInstance("Test");
        const auditId = createTable(project.ydoc, "Audit", "audit");
        const tasksId = createTable(project.ydoc, "Tasks", "tasks");
        const concreteSql = "INSERT INTO audit (id) VALUES ('one') RETURNING *";
        const ruleId = createScheduleRule(project, {
            name: "Audit Rule",
            targetTableId: auditId,
            sql: concreteSql,
            rrule: "FREQ=DAILY",
        });

        // Retarget without changing SQL
        project.schedules.get(ruleId)?.set("targetTableId", tasksId);

        expect(scheduleTableReferences(project, ruleId)).toEqual([
            { tableId: tasksId, kind: "write-target" },
            { tableId: auditId, kind: "sql-reference" },
        ]);
        expect(findSchedulesReferencingTable(project, auditId)).toEqual([
            { ruleId, ruleName: "Audit Rule", kind: "sql-reference", enabled: true },
        ]);

        const auditDeps = getTableDependencies(project, auditId);
        expect(auditDeps.scheduleReferences).toEqual([
            { ruleId, ruleName: "Audit Rule", kind: "sql-reference" },
        ]);
        expect(auditDeps.indirectSqlReferences).toContainEqual({
            type: "schedule",
            name: "Audit Rule",
        });
        expect(project.schedules.get(ruleId)?.get("sql")).toBe(concreteSql);
    });

    it("removes table removing direct references", () => {
        const project = Project.createInstance("Test");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, { name: "G", query: "SELECT * FROM t" });

        const page = project.addPage("Page 1", "test");
        const item1 = page.items.addNode("test");

        let nodeValue: Y.Map<unknown>;
        project.ydoc.transact(() => {
            nodeValue = item1.tree.getNodeValueFromKey(item1.key) as Y.Map<unknown>;
            nodeValue.set("componentType", "yjstable");
            nodeValue.set("yjsGridId", gridId);
        });

        const res = removeTableWithPolicy(project, tableId, "remove-direct-references");
        expect(res?.detachedGridCount).toBe(0);
        expect(res?.deletedGridCount).toBe(0);

        // Registry entry gone
        expect(getTableRegistry(project.ydoc).has(tableId)).toBe(false);
        // Direct reference detached
        expect(nodeValue!.get("componentType")).toBe("yjstable");
        expect(nodeValue!.get("yjsGridId")).toBe(gridId);
        // The Grid definition has also been removed together with the Table.
        expect(listGrids(project.ydoc).map(grid => grid.gridId)).toEqual([gridId]);
    });

    it("restores only the Table and preserves peer Grid edits in Undo and Redo", () => {
        globalUndoRouter.clear();
        const project = Project.createInstance("Test");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, { name: "G", query: "SELECT * FROM t" });

        expect(removeTableWithPolicyUndoable(project, tableId)).toBe(true);
        expect(getTableRegistry(project.ydoc).has(tableId)).toBe(false);
        expect(listGrids(project.ydoc).map(grid => grid.gridId)).toEqual([gridId]);

        const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(gridId)!;
        project.ydoc.transact(() => grid.set("query", "SELECT 1 AS peer"), "peer");
        globalUndoRouter.undo();
        expect(getTableRegistry(project.ydoc).has(tableId)).toBe(true);
        expect(listGrids(project.ydoc).map(grid => grid.gridId)).toEqual([gridId]);

        expect(grid.get("query")).toBe("SELECT 1 AS peer");
        globalUndoRouter.redo();
        expect(grid.get("query")).toBe("SELECT 1 AS peer");
        expect(getTableRegistry(project.ydoc).has(tableId)).toBe(false);
        expect(listGrids(project.ydoc).map(grid => grid.gridId)).toEqual([gridId]);
    });
});

// Issue #5012: a Schedule is a project-level entity that *references* Tables.
// It is never structurally owned by one of them, so the same Schedule shows up
// as a dependency of every Table it touches.
describe("schedule references are project-level, not Table-owned", () => {
    /** A project with two Tables and one Schedule that reads A and writes B. */
    function projectWithCrossTableSchedule() {
        const project = Project.createInstance("Test");
        const templatesId = createTable(project.ydoc, "Templates", "routine_templates");
        const occurrencesId = createTable(project.ydoc, "Occurrences", "routine_occurrences");
        const ruleId = createScheduleRule(project, {
            name: "Nightly routines",
            targetTableId: occurrencesId,
            sql: "INSERT INTO routine_occurrences (id, title) SELECT t.id, t.title FROM routine_templates t RETURNING *",
            rrule: "FREQ=DAILY",
        });
        return { project, templatesId, occurrencesId, ruleId };
    }

    it("reports one Schedule as a dependency of every Table it references", () => {
        const { project, templatesId, occurrencesId, ruleId } = projectWithCrossTableSchedule();

        const templateDeps = getTableDependencies(project, templatesId);
        const occurrenceDeps = getTableDependencies(project, occurrencesId);

        expect(templateDeps.scheduleReferences).toEqual([
            { ruleId, ruleName: "Nightly routines", kind: "sql-reference" },
        ]);
        expect(occurrenceDeps.scheduleReferences).toEqual([
            { ruleId, ruleName: "Nightly routines", kind: "write-target" },
        ]);
    });

    it("keeps the write target as the only Table the delete policy removes it with", () => {
        const { project, templatesId, occurrencesId, ruleId } = projectWithCrossTableSchedule();

        // The Table it only reads does not own it, so its deletion policy
        // never deletes the Schedule.
        expect(getTableDependencies(project, templatesId).scheduledTargets).toEqual([]);
        expect(getTableDependencies(project, occurrencesId).scheduledTargets).toEqual([
            { ruleId, ruleName: "Nightly routines" },
        ]);
    });

    it("warns about a read-only reference rather than silently breaking it", () => {
        const { project, templatesId } = projectWithCrossTableSchedule();

        expect(getTableDependencies(project, templatesId).indirectSqlReferences).toEqual([
            { type: "schedule", name: "Nightly routines" },
        ]);
    });

    it("lists every referenced Table of a Schedule without picking an owner", () => {
        const { project, templatesId, occurrencesId, ruleId } = projectWithCrossTableSchedule();

        expect(scheduleTableReferences(project, ruleId)).toEqual([
            { tableId: occurrencesId, kind: "write-target" },
            { tableId: templatesId, kind: "sql-reference" },
        ]);
    });
});
