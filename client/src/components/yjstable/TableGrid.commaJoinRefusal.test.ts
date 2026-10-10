// Comma-joined refusal through the mounted TableGrid (issue #5547): the
// component's own editability derivation, command context, and mutation
// entry points refuse every bare-id write for a comma-joined result. The
// `bareIdAuthority` prop is computed by the real resolver from the real
// saved-query text (the same text the runner executes in
// gridCommaJoinVariants.test.ts), and Table/Undo state is observed
// directly. Covers ordinary cell commits, checkbox/select writes, clear,
// row deletion — including a deletion confirmed after the query changed.

import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, type GridHandles } from "../../services/yjstable/gridDocs";
import { analyzeQueryEditability, resolveBareIdMutationAuthority } from "../../services/yjstable/queryAnalysis";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord, createTable, getTableHandles, type TableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const COMMA_QUERY = "SELECT a.id, a.title, a.done, a.status FROM tasks_a AS a, tasks_b AS b";
const BASE_QUERY = "SELECT id, title, done, status FROM tasks_a";

const schema: ParsedTableSchema = {
    tableName: "tasks_a",
    createSql: "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN, status TEXT)",
    columns: [
        { name: "id", dataType: "text", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "title", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        { name: "done", dataType: "boolean", isNullable: true, isPrimaryKey: false, kind: "boolean", checkOptions: [] },
        {
            name: "status",
            dataType: "text",
            isNullable: true,
            isPrimaryKey: false,
            kind: "text",
            checkOptions: ["Open", "Done"],
        },
    ],
};

const session: RelationResolver = { resolveRelation: vi.fn() };

/**
 * Table A holds two records, Table B one unrelated record: COMMA_QUERY is a
 * genuine two-source cross join whose projected A identities stay distinct,
 * so the mounted Grid renders both rows. Overlapping identities (duplicate
 * `id` values) are covered by the real-runner service suite and the
 * YjsTableView surface suite instead.
 */
function seedTables() {
    const doc = new Y.Doc();
    const tableA = createTable(doc, "Table A", "tasks_a");
    createTable(doc, "Table B", "tasks_b");
    const handlesA = getTableHandles(doc, tableA)!;
    const gridId = createGrid(doc, tableA, { name: "Grid", query: BASE_QUERY });
    const grid = getGridHandles(doc, gridId)!;
    addRecord(handlesA, { title: "Value in A", done: false, status: "Open" }, "r1");
    addRecord(handlesA, { title: "Second in A", done: true, status: "Done" }, "r2");
    return { doc, handlesA, grid };
}

/** The cross-join rows for COMMA_QUERY over the seed above: two sources, distinct A identities. */
function commaResult(): TableQueryResult {
    return {
        columns: ["id", "title", "done", "status"],
        rows: [
            { id: "r1", title: "Value in A", done: false, status: "Open" },
            { id: "r2", title: "Second in A", done: true, status: "Done" },
        ],
    };
}

/**
 * Mount with an empty result first, then deliver the combined rows through
 * a prop update — the same empty-then-loaded flow YjsTableView drives in
 * production. Mounting straight onto duplicate row identities would throw
 * `each_key_duplicate` out of the initial render instead.
 */
async function mountRefused(handlesA: TableHandles, grid: GridHandles) {
    const result = commaResult();
    // Authority from the production resolver over the real saved-query text.
    const bareIdAuthority = resolveBareIdMutationAuthority(COMMA_QUERY, "tasks_a", schema, result.columns);
    expect(bareIdAuthority.status).toBe("unavailable");
    const editability = analyzeQueryEditability(COMMA_QUERY, schema, result.columns, bareIdAuthority);
    expect(editability.editable).toBe(false);
    const props = {
        grid,
        handles: handlesA,
        schema,
        query: COMMA_QUERY,
        result: { columns: result.columns, rows: [] },
        bareIdAuthority,
        componentTypes: { status: "select" },
        columnLabels: {},
        hiddenColumns: {},
        columnOrder: ["title", "done", "status"],
        session,
        placementId: "comma-refusal",
        pageId: "comma-page",
    };
    const view = render(TableGrid, { props });
    await view.rerender({ ...props, result });
    return view;
}

function cellTd(container: HTMLElement, column: string): HTMLElement {
    return container.querySelector<HTMLElement>(`td[data-col="${column}"]`)!;
}

function snapshotOf(handles: TableHandles) {
    return {
        title1: handles.data.get("r1")?.get("title"),
        done1: handles.data.get("r1")?.get("done"),
        status1: handles.data.get("r1")?.get("status"),
        title2: handles.data.get("r2")?.get("title"),
        done2: handles.data.get("r2")?.get("done"),
        status2: handles.data.get("r2")?.get("status"),
        size: handles.data.size,
        undo: handles.undo.undoStack.length,
    };
}

describe("TableGrid comma-join refusal (issue #5547)", () => {
    it("explains the provenance and refuses ordinary cell, checkbox, and select commits", async () => {
        const { handlesA, grid } = seedTables();
        const view = await mountRefused(handlesA, grid);
        const before = snapshotOf(handlesA);
        try {
            expect(view.queryByTestId("grid-readonly-reason")?.textContent).toMatch(/multiple sources|several tables/);

            // Ordinary text commit opens no editor.
            await fireEvent.click(cellTd(view.container, "title").querySelector("button")!);
            expect(view.container.querySelector("input.cell-input")).toBeNull();

            // Checkbox and select commits write nothing.
            const checkbox = cellTd(view.container, "done").querySelector("input[type=checkbox]");
            if (checkbox) await fireEvent.click(checkbox);
            const select = cellTd(view.container, "status").querySelector("select");
            if (select) await fireEvent.change(select, { target: { value: "Done" } });

            expect(snapshotOf(handlesA)).toEqual(before);
        } finally {
            view.unmount();
        }
    });

    it("refuses Delete-key clearing and rows-kind removal", async () => {
        const { handlesA, grid } = seedTables();
        const view = await mountRefused(handlesA, grid);
        const before = snapshotOf(handlesA);
        try {
            await fireEvent.click(cellTd(view.container, "title"));
            await fireEvent.keyDown(cellTd(view.container, "title").querySelector("button")!, { key: "Delete" });
            expect(handlesA.data.get("r1")?.get("title")).toBe("Value in A");

            const rowHeader = view.container.querySelector("th.row-header") as HTMLElement | null;
            expect(rowHeader).not.toBeNull();
            await fireEvent.click(rowHeader!);
            await fireEvent.keyDown(rowHeader!, { key: "Delete" });
            expect(snapshotOf(handlesA)).toEqual(before);
        } finally {
            view.unmount();
        }
    });

    it("refuses a deletion confirmed after the result became a comma join", async () => {
        const { handlesA, grid } = seedTables();
        // Writable single-Table result first: the ordinary row delete opens
        // its confirmation, holding the removal pending.
        const baseResult: TableQueryResult = {
            columns: ["id", "title", "done", "status"],
            rows: [{ id: "r1", title: "Value in A", done: false, status: "Open" }],
        };
        const baseAuthority = resolveBareIdMutationAuthority(BASE_QUERY, "tasks_a", schema, baseResult.columns);
        expect(baseAuthority.status).toBe("compatible");
        const baseProps = {
            grid: grid!,
            handles: handlesA,
            schema,
            query: BASE_QUERY,
            result: baseResult,
            bareIdAuthority: baseAuthority,
            componentTypes: { status: "select" },
            columnLabels: {},
            hiddenColumns: {},
            columnOrder: ["title", "done", "status"],
            session,
            placementId: "comma-pending-delete",
            pageId: "comma-page",
            confirmRowDelete: true,
        };
        const view = render(TableGrid, { props: baseProps });
        const before = snapshotOf(handlesA);
        try {
            const rowHeader = view.getByRole("rowheader", { name: "Select row 1" });
            await fireEvent.click(rowHeader);
            await fireEvent.keyDown(rowHeader, { key: "Delete" });
            expect(view.container.querySelector("dialog")?.textContent).toContain("1 selected row");

            // The completed comma result lands while the confirmation is
            // pending — exactly what YjsTableView pushes through new props.
            const refused = commaResult();
            const refusedAuthority = resolveBareIdMutationAuthority(
                COMMA_QUERY,
                "tasks_a",
                schema,
                refused.columns,
            );
            expect(refusedAuthority.status).toBe("unavailable");
            await view.rerender({
                ...baseProps,
                query: COMMA_QUERY,
                result: refused,
                bareIdAuthority: refusedAuthority,
            });
            expect(view.queryByTestId("grid-readonly-reason")?.textContent).toMatch(/multiple sources|several tables/);

            // Confirming the stale deletion commits nothing at the final gate.
            await fireEvent.click(view.getByText("Delete", { selector: "button" }));
            expect(snapshotOf(handlesA)).toEqual(before);
        } finally {
            view.unmount();
        }
    });

    it("keeps the refused result selectable and copyable", async () => {
        const { handlesA, grid } = seedTables();
        const view = await mountRefused(handlesA, grid);
        try {
            const write = vi.fn().mockResolvedValue(undefined);
            vi.stubGlobal(
                "ClipboardItem",
                class {
                    constructor(private readonly parts: Record<string, Blob>) {}
                    getType(mime: string): Promise<Blob> {
                        return Promise.resolve(this.parts[mime]);
                    }
                },
            );
            Object.defineProperty(navigator, "clipboard", {
                value: { write, readText: vi.fn().mockResolvedValue("") },
                configurable: true,
            });
            await fireEvent.click(cellTd(view.container, "title"));
            await fireEvent.keyDown(cellTd(view.container, "title").querySelector("button")!, {
                key: "c",
                ctrlKey: true,
            });
            await vi.waitFor(() => expect(write).toHaveBeenCalled());
            const item = write.mock.calls[0][0][0] as ClipboardItem;
            expect(await (await item.getType("text/plain")).text()).toContain("Value in A");
        } finally {
            vi.unstubAllGlobals();
            view.unmount();
        }
    });
});
