// Comma-join paste/replace/add-row coverage on the mounted TableGrid
// (issue #5547): rectangular paste, Find/Replace and Replace All, and Add
// row all refuse a comma-joined result through the component's own context
// and search-provider wiring, while a writable single-Table result —
// including the zero-row case — keeps working. Authority props come from
// the real resolver over the real saved-query text; Table/Undo state is
// observed directly.

import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { gridSearchMatches, replaceGridMatch, replaceGridMatches } from "../../lib/search/unifiedSearch";
import { createGrid, getGridHandles, getGridQuery, type GridHandles } from "../../services/yjstable/gridDocs";
import { analyzeQueryEditability, resolveBareIdMutationAuthority } from "../../services/yjstable/queryAnalysis";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord, createTable, getTableHandles, type TableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const COMMA_QUERY = "SELECT a.id, a.title FROM tasks_a AS a, tasks_b AS b";
const BASE_QUERY = "SELECT id, title FROM tasks_a";

const schema: ParsedTableSchema = {
    tableName: "tasks_a",
    createSql: "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)",
    columns: [
        { name: "id", dataType: "text", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "title", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
    ],
};

const session: RelationResolver = { resolveRelation: vi.fn() };

function seedTables() {
    const doc = new Y.Doc();
    const tableA = createTable(doc, "Table A", "tasks_a");
    createTable(doc, "Table B", "tasks_b");
    const handlesA = getTableHandles(doc, tableA)!;
    const gridId = createGrid(doc, tableA, { name: "Grid", query: BASE_QUERY });
    const grid = getGridHandles(doc, gridId)!;
    addRecord(handlesA, { title: "Value in A" }, "r1");
    addRecord(handlesA, { title: "Second in A" }, "r2");
    return { handlesA, grid };
}

function baseProps(handlesA: TableHandles, grid: GridHandles, placementId: string) {
    return {
        grid,
        handles: handlesA,
        schema,
        query: BASE_QUERY,
        result: {
            columns: ["id", "title"],
            rows: [
                { id: "r1", title: "Value in A" },
                { id: "r2", title: "Second in A" },
            ],
        } satisfies TableQueryResult,
        bareIdAuthority: resolveBareIdMutationAuthority(BASE_QUERY, "tasks_a", schema, ["id", "title"]),
        componentTypes: {},
        columnLabels: {},
        hiddenColumns: {},
        columnOrder: ["title"],
        session,
        placementId,
        pageId: "comma-paste-page",
    };
}

/** Mount with an empty result, then deliver the combined rows as production does. */
async function mountRefused(handlesA: TableHandles, grid: GridHandles, placementId: string) {
    const columns = ["id", "title"];
    const refusedAuthority = resolveBareIdMutationAuthority(COMMA_QUERY, "tasks_a", schema, columns);
    expect(refusedAuthority.status).toBe("unavailable");
    const props = {
        ...baseProps(handlesA, grid, placementId),
        query: COMMA_QUERY,
        result: { columns, rows: [] } satisfies TableQueryResult,
        bareIdAuthority: refusedAuthority,
    };
    const view = render(TableGrid, { props });
    await view.rerender({
        ...props,
        result: {
            columns,
            rows: [
                { id: "r1", title: "Value in A" },
                { id: "r2", title: "Second in A" },
            ],
        } satisfies TableQueryResult,
    });
    expect(view.queryByTestId("grid-readonly-reason")?.textContent).toMatch(/multiple sources|several tables/);
    return view;
}

function cellTd(container: HTMLElement): HTMLElement {
    return container.querySelector<HTMLElement>(`td[data-col="title"]`)!;
}

function snapshotOf(handles: TableHandles) {
    return {
        first: handles.data.get("r1")?.get("title"),
        second: handles.data.get("r2")?.get("title"),
        size: handles.data.size,
        undo: handles.undo.undoStack.length,
    };
}

describe("TableGrid comma-join paste/replace/add-row (issue #5547)", () => {
    it("refuses rectangular paste into the refused result", async () => {
        const { handlesA, grid } = seedTables();
        const view = await mountRefused(handlesA, grid, "comma-paste");
        const before = snapshotOf(handlesA);
        try {
            const readText = vi.fn().mockResolvedValue("Hacked");
            Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
            await fireEvent.click(cellTd(view.container));
            await fireEvent.keyDown(cellTd(view.container).querySelector("button")!, { key: "v", ctrlKey: true });
            await vi.waitFor(() => expect(readText).toHaveBeenCalled());
            // The rejection surfaces as status text only after the async
            // clipboard read resolves: wait for it, then assert no write.
            await vi.waitFor(() =>
                expect(view.container.textContent).toContain("Nothing in the selection is editable.")
            );
            expect(snapshotOf(handlesA)).toEqual(before);
        } finally {
            vi.unstubAllGlobals();
            view.unmount();
        }
    });

    it("finds but never replaces cells of the refused result", async () => {
        const { handlesA, grid } = seedTables();
        const view = await mountRefused(handlesA, grid, "comma-replace");
        const before = snapshotOf(handlesA);
        try {
            // Find still sees the queried text, marked as not replaceable.
            const matches = gridSearchMatches("comma-paste-page", "Value", {});
            expect(matches.length).toBeGreaterThan(0);
            for (const match of matches) expect(match.replaceable).toBe(false);

            // Single Replace and Replace All apply nothing and skip read-only cells.
            const [first] = matches;
            const single = replaceGridMatch(first!, "Value", "Hacked", {});
            expect(single?.applied).toBe(false);
            const all = replaceGridMatches("comma-paste-page", "Value", "Hacked", {});
            expect(all.appliedCells).toBe(0);
            expect(all.skippedReadOnly).toBeGreaterThan(0);
            expect(snapshotOf(handlesA)).toEqual(before);
        } finally {
            view.unmount();
        }
    });

    it("offers no Add row on the refused result but keeps it for writable results", async () => {
        const { handlesA, grid } = seedTables();
        // Phases mount one surface at a time: test queries are document
        // scoped, so a still-mounted sibling would answer them instead.
        const refused = await mountRefused(handlesA, grid, "comma-add-row");
        expect(refused.container.querySelector('[data-testid="yjs-table-add-row"]')).toBeNull();
        refused.unmount();

        // Writable single-Table result: Add row writes to the source Table only.
        const writable = render(TableGrid, { props: baseProps(handlesA, grid, "comma-add-row-ok") });
        try {
            expect(writable.container.querySelector('[data-testid="grid-readonly-reason"]')).toBeNull();
            const sizeBefore = handlesA.data.size;
            await fireEvent.click(writable.getByTestId("yjs-table-add-row"));
            expect(handlesA.data.size).toBe(sizeBefore + 1);
            const added = [...handlesA.data.keys()].filter((id) => id !== "r1" && id !== "r2");
            expect(added).toHaveLength(1);
        } finally {
            writable.unmount();
        }

        // Eligible zero-row result: Add row still writes to the source Table.
        const emptyAuthority = resolveBareIdMutationAuthority(BASE_QUERY, "tasks_a", schema, ["id", "title"]);
        expect(emptyAuthority.status).toBe("compatible");
        expect(analyzeQueryEditability(BASE_QUERY, schema, ["id", "title"], emptyAuthority).editable).toBe(true);
        const empty = render(TableGrid, {
            props: {
                ...baseProps(handlesA, grid, "comma-add-row-empty"),
                result: { columns: ["id", "title"], rows: [] },
                bareIdAuthority: emptyAuthority,
            },
        });
        try {
            const sizeBefore = handlesA.data.size;
            await fireEvent.click(empty.getByTestId("yjs-table-add-row"));
            expect(handlesA.data.size).toBe(sizeBefore + 1);
        } finally {
            empty.unmount();
        }
        expect(getGridQuery(grid)).toBe(BASE_QUERY);
    });
});
