import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createMutationHarness, createTestTable } from "../../services/yjstable/gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord } from "../../services/yjstable/tableDocs";
import { createTableEngineSession, resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import TableGrid from "./TableGrid.svelte";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

const booleanSchema = (tableName: string): ParsedTableSchema => ({
    tableName,
    createSql: `CREATE TABLE ${tableName} (id TEXT PRIMARY KEY, done BOOLEAN)`,
    columns: [
        { name: "id", dataType: "text", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "done", dataType: "boolean", isNullable: true, isPrimaryKey: false, kind: "boolean", checkOptions: [] },
    ],
});

describe("mounted guarded Grid command dispatch", { timeout: 30_000 }, () => {
    beforeEach(() => {
        HTMLDialogElement.prototype.showModal = () => {};
        HTMLDialogElement.prototype.close = () => {};
    });

    it("refuses single-cell and row-button writes when current source authority rejects them", async () => {
        const doc = new Y.Doc({ guid: "mounted-guarded-single" });
        const table = createTestTable(doc, "b", booleanSchema("b").createSql, "one", { done: false });
        const harness = await createMutationHarness(doc, "SELECT id, done FROM b");
        const relationSession = createTableEngineSession({ projectDoc: doc });
        const view = render(TableGrid, {
            props: {
                handles: table.handles,
                schema: booleanSchema("b"),
                query: "SELECT id, done FROM b",
                result: { columns: ["id", "done"], rows: harness.evidence().rows },
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: { id: true },
                columnOrder: ["done"],
                session: relationSession,
                mutationBoundary: harness.boundary,
                prepareMutationAuthority: async () => {},
            },
        });
        try {
            harness.setAllowed(false);
            await fireEvent.click(view.container.querySelector<HTMLInputElement>("input[type=checkbox]")!);
            await waitFor(() => expect(view.getByTestId("grid-edit-status").textContent).toContain("Edit refused"));
            expect(table.handles.data.get("one")?.get("done")).toBe(false);

            await fireEvent.click(view.getByRole("button", { name: "Delete row one" }));
            await waitFor(() => expect(view.getByTestId("grid-edit-status").textContent).toContain("Delete refused"));
            expect(table.handles.data.has("one")).toBe(true);
        } finally {
            view.unmount();
            relationSession.dispose();
            harness.dispose();
        }
    });

    it("routes a single UNION branch edit to its verified physical source", async () => {
        const doc = new Y.Doc({ guid: "mounted-guarded-union" });
        const a = createTestTable(doc, "a", booleanSchema("a").createSql, "same", { done: false });
        const b = createTestTable(doc, "b", booleanSchema("b").createSql, "same", { done: false });
        const query = "SELECT 'a' AS source_kind, id AS source_id, done FROM a "
            + "UNION ALL SELECT 'b', id, done FROM b ORDER BY source_kind";
        const harness = await createMutationHarness(doc, query);
        const relationSession = createTableEngineSession({ projectDoc: doc });
        const view = render(TableGrid, {
            props: {
                handles: b.handles,
                schema: booleanSchema("b"),
                query,
                result: { columns: ["source_kind", "source_id", "done"], rows: harness.evidence().rows },
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: { source_kind: true, source_id: true },
                columnOrder: ["done"],
                session: relationSession,
                mutationBoundary: harness.boundary,
                prepareMutationAuthority: async () => {},
            },
        });
        try {
            const bRow = view.container.querySelector<HTMLElement>("tr[data-record-id='b:same']")!;
            await fireEvent.click(bRow.querySelector<HTMLInputElement>("input[type=checkbox]")!);
            await waitFor(() => expect(b.handles.data.get("same")?.get("done")).toBe(true));
            expect(a.handles.data.get("same")?.get("done")).toBe(false);
        } finally {
            view.unmount();
            relationSession.dispose();
            harness.dispose();
        }
    });

    it("awaits row deletion and reports the exact partial provider outcome", async () => {
        const doc = new Y.Doc({ guid: "mounted-guarded-delete" });
        const table = createTestTable(doc, "b", booleanSchema("b").createSql, "one", { done: false });
        addRecord(table.handles, { done: false }, "two");
        const harness = await createMutationHarness(doc, "SELECT id, done FROM b ORDER BY id", { failWriteNumber: 2 });
        const relationSession = createTableEngineSession({ projectDoc: doc });
        const view = render(TableGrid, {
            props: {
                handles: table.handles,
                schema: booleanSchema("b"),
                query: "SELECT id, done FROM b ORDER BY id",
                result: { columns: ["id", "done"], rows: harness.evidence().rows },
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: { id: true },
                columnOrder: ["done"],
                session: relationSession,
                mutationBoundary: harness.boundary,
                prepareMutationAuthority: async () => {},
            },
        });
        try {
            const rows = view.getAllByRole("rowheader");
            await fireEvent.click(rows[0]!);
            await fireEvent.click(rows[1]!, { ctrlKey: true });
            await fireEvent.keyDown(rows[1]!, { key: "Delete" });
            await waitFor(() => expect(view.getByTestId("grid-edit-status").textContent).toContain("b:one"));
            expect(table.handles.data.has("one")).toBe(false);
            expect(table.handles.data.has("two")).toBe(true);
        } finally {
            view.unmount();
            relationSession.dispose();
            harness.dispose();
        }
    });
});
