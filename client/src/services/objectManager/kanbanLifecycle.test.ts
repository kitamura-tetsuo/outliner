import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createKanban, getKanban, listKanbans, removeKanbanWithPlacements } from "../yjstable/kanbanDocs";
import { getTableDependencies, removeTableWithPolicy } from "../yjstable/tableDependencies";
import { createTable, listTables } from "../yjstable/tableDocs";
import { buildObjectDependencyGraph } from "./objectDependencyGraph";
import { placeObjectOnPage } from "./objectPlacement";
import { findKanbanPlacements } from "./objectPlacements";

function bind(item: { tree: { getNodeValueFromKey(key: string): unknown; }; key: string; }, id: string) {
    const node = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
    node.set("componentType", "kanban");
    node.set("kanbanId", id);
}

describe("Kanban placement and reference lifecycle", () => {
    it("adds a reference-only placement after validating its Page and definition", () => {
        const project = Project.createInstance("kanban-place");
        const tableId = createTable(project.ydoc, "Tasks", "tasks");
        const board = createKanban(project.ydoc, { kanbanId: "board" });
        const page = project.addPage("Dashboard", "test");
        placeObjectOnPage(project.ydoc, page.id, "kanban", board, "test", {
            projectAccess: true,
            surfaceWritable: true,
        });
        expect(findKanbanPlacements(project, board)).toHaveLength(1);
        expect(() =>
            placeObjectOnPage(project.ydoc, "missing", "kanban", board, "test", {
                projectAccess: true,
                surfaceWritable: true,
            })
        ).toThrow(/Page/);
        expect(findKanbanPlacements(project, board)).toHaveLength(1);
    });

    it("discovers multiple placements and deletes only bindings still targeting the board", () => {
        const project = Project.createInstance("kanban-lifecycle");
        const tableId = createTable(project.ydoc, "Tasks", "tasks");
        const first = createKanban(project.ydoc, { kanbanId: "first", name: "First" });
        const second = createKanban(project.ydoc, { kanbanId: "second", name: "Second" });
        const page = project.addPage("Dashboard", "test");
        const a = page.items.addNode("test");
        const b = page.items.addNode("test");
        bind(a, first);
        bind(b, first);
        expect(findKanbanPlacements(project, first)).toHaveLength(2);

        // Simulate a peer rebinding after the confirmation inventory.
        (b.tree.getNodeValueFromKey(b.key) as Y.Map<unknown>).set("kanbanId", second);
        expect(removeKanbanWithPlacements(project, first)).toBe(true);
        expect(getKanban(project.ydoc, first)).toBeUndefined();
        expect(() => project.tree.getNodeValueFromKey(a.key)).toThrow();
        expect((b.tree.getNodeValueFromKey(b.key) as Y.Map<unknown>).get("kanbanId")).toBe(second);
        expect(listTables(project.ydoc).map(table => table.tableId)).toContain(tableId);
    });

    it("ignores source_kind labels when building Kanban Table dependencies", () => {
        const project = Project.createInstance("kanban-literal-dependency");
        const tasks = createTable(project.ydoc, "Tasks", "tasks");
        const unrelated = createTable(project.ydoc, "Unrelated", "unrelated");
        const board = createKanban(project.ydoc, {
            query: "SELECT 'unrelated' AS source_kind, status, title FROM tasks",
        });
        expect(buildObjectDependencyGraph(project.ydoc).dependenciesOf({ type: "kanban", id: board }))
            .toEqual([{ type: "table", id: tasks }]);
        expect(getTableDependencies(project, unrelated).indirectSqlReferences).toEqual([]);
    });

    it("keeps empty-query evidence unknown instead of inferring ownership", () => {
        const project = Project.createInstance("kanban-unknown");
        const source = createTable(project.ydoc, "A", "table_a");
        const board = createKanban(project.ydoc, { query: "" });
        const deps = getTableDependencies(project, source);
        expect(deps.dependentKanbanIds).toEqual([]);
        expect(deps.unknownReferences).toContainEqual(
            expect.objectContaining({ object: { type: "kanban", id: board } }),
        );
        expect(buildObjectDependencyGraph(project.ydoc).analysisOf({ type: "kanban", id: board })?.status).toBe(
            "unknown",
        );
    });

    it("tracks only parsed query dependencies and preserves SQL-dependent Kanbans for both Table policies", () => {
        const project = Project.createInstance("kanban-table-policy");
        const a = createTable(project.ydoc, "A", "table_a");
        const b = createTable(project.ydoc, "B", "table_b");
        const direct = createKanban(project.ydoc, { kanbanId: "direct", query: "SELECT * FROM table_a" });
        const indirect = createKanban(project.ydoc, {
            kanbanId: "indirect",
            query: "SELECT * FROM table_a -- table_b in a comment\nWHERE 'table_b' = 'table_b'",
        });
        const deps = getTableDependencies(project, a);
        expect(deps.dependentKanbanIds).toEqual([direct, indirect]);
        expect(deps.indirectSqlReferences).toEqual([]);
        expect(buildObjectDependencyGraph(project.ydoc).dependenciesOf({ type: "kanban", id: indirect }))
            .toEqual([{ type: "table", id: a }]);

        const page = project.addPage("Boards", "author");
        const placement = page.items.addNode("author");
        bind(placement, indirect);
        const originalPlacement = project.tree.getNodeValueFromKey(placement.key);
        const originalBoard = getKanban(project.ydoc, indirect);
        expect(removeTableWithPolicy(project, a, "keep-references")).toBeDefined();
        expect(getKanban(project.ydoc, indirect)).toEqual(originalBoard);
        expect(project.tree.getNodeValueFromKey(placement.key)).toBe(originalPlacement);
        expect(listKanbans(project.ydoc).map(board => board.kanbanId)).toEqual(
            expect.arrayContaining([direct, indirect]),
        );

        const project2 = Project.createInstance("kanban-table-remove");
        const source = createTable(project2.ydoc, "A", "table_a");
        const direct2 = createKanban(project2.ydoc, { kanbanId: "direct", query: "SELECT * FROM table_a" });
        expect(removeTableWithPolicy(project2, source, "remove-direct-references")).toBeDefined();
        expect(getKanban(project2.ydoc, direct2)).toBeDefined();
    });
});
