// Raw-Table production boundary for parser-derived writability: TableGrid must
// consume the parsed result before its normal Table-owned mutation/history path.
import { fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord, createTable, destroyTableUndoManager, getTableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const session: RelationResolver = { resolveRelation: vi.fn() };
const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: 'CREATE TABLE tasks (id uuid, "題名" text);',
    columns: [
        { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "題名", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
    ],
};

afterEach(() => globalUndoRouter.clear());

describe("TableGrid parsed projection write boundary", () => {
    it("edits a quoted Unicode direct column and records the real Table history", async () => {
        const doc = new Y.Doc();
        const tableId = createTable(doc, "tasks", "tasks");
        const handles = getTableHandles(doc, tableId)!;
        addRecord(handles, { 題名: "before" }, "row-1");
        const result: TableQueryResult = { columns: ["id", "題名"], rows: [{ id: "row-1", 題名: "before" }] };
        const view = render(TableGrid, {
            props: {
                handles,
                schema,
                query: 'SELECT id, "題名" FROM tasks /* join, from */ WHERE "題名" <> $noise$group by$noise$',
                result,
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: { id: true },
                columnOrder: ["題名"],
                session,
            },
        });
        globalUndoRouter.clear();
        handles.undo.stopCapturing();
        const cell = view.container.querySelector<HTMLElement>('td[data-row-id="row-1"][data-col="題名"]')!;
        await fireEvent.keyDown(cell.querySelector("button")!, { key: "F2" });
        const input = cell.querySelector<HTMLInputElement>("input")!;
        await fireEvent.input(input, { target: { value: "after" } });
        await fireEvent.keyDown(input, { key: "Enter" });

        expect(handles.data.get("row-1")?.get("題名")).toBe("after");
        expect(globalUndoRouter.undoDepth).toBe(1);
        globalUndoRouter.undo();
        expect(handles.data.get("row-1")?.get("題名")).toBe("before");
        destroyTableUndoManager(handles.doc);
    });
});
