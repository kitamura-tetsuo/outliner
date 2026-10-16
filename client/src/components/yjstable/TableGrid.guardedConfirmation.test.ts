import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createMutationHarness, createTestTable } from "../../services/yjstable/gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTableEngineSession, resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import TableGrid from "./TableGrid.svelte";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

const schema: ParsedTableSchema = {
    tableName: "b",
    createSql: "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)",
    columns: [
        { name: "id", dataType: "text", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "value", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
    ],
};

describe("mounted guarded Grid confirmation", { timeout: 30_000 }, () => {
    beforeEach(() => {
        HTMLDialogElement.prototype.showModal = () => {};
        HTMLDialogElement.prototype.close = () => {};
    });

    it("preserves captured intent identity while confirmation is stored in component state", async () => {
        const doc = new Y.Doc({ guid: "mounted-guarded-confirmation-success" });
        const table = createTestTable(doc, "b", schema.createSql, "one", { value: "B" });
        const harness = await createMutationHarness(doc, "SELECT id, value FROM b");
        const relationSession = createTableEngineSession({ projectDoc: doc });
        const view = render(TableGrid, {
            props: {
                handles: table.handles,
                schema,
                query: "SELECT id, value FROM b",
                result: { columns: ["id", "value"], rows: harness.evidence().rows },
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: { id: true },
                columnOrder: ["value"],
                session: relationSession,
                mutationBoundary: harness.boundary,
                prepareMutationAuthority: async () => {},
                confirmRowDelete: true,
            },
        });
        try {
            await fireEvent.click(view.getByRole("button", { name: "Delete row one" }));
            await fireEvent.click(view.getByText("Delete", { selector: "button" }));
            await waitFor(() => expect(table.handles.data.has("one")).toBe(false));
            expect(view.queryByTestId("grid-edit-status")).toBeNull();
        } finally {
            view.unmount();
            relationSession.dispose();
            harness.dispose();
        }
    });

    it("refuses confirmation after query A-to-B-to-A instead of recapturing authority", async () => {
        const doc = new Y.Doc({ guid: "mounted-guarded-confirmation" });
        const a = createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "A",
        });
        const b = createTestTable(doc, "b", schema.createSql, "same", { value: "B" });
        const queryB = "SELECT id, value FROM b";
        const harness = await createMutationHarness(doc, queryB);
        const relationSession = createTableEngineSession({ projectDoc: doc });
        const view = render(TableGrid, {
            props: {
                handles: b.handles,
                schema,
                query: queryB,
                result: { columns: ["id", "value"], rows: harness.evidence().rows },
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: { id: true },
                columnOrder: ["value"],
                session: relationSession,
                mutationBoundary: harness.boundary,
                prepareMutationAuthority: async () => {},
                confirmRowDelete: true,
            },
        });
        try {
            const row = view.getByRole("rowheader", { name: "Select row 1" });
            await fireEvent.click(row);
            await fireEvent.keyDown(row, { key: "Delete" });
            expect(view.container.querySelector("dialog")?.textContent).toContain("1 selected row");

            await harness.refresh("SELECT id, value FROM a");
            await harness.refresh(queryB);
            await fireEvent.click(view.getByText("Delete", { selector: "button" }));

            await waitFor(() => expect(view.getByTestId("grid-edit-status").textContent).toContain("Delete refused"));
            expect(b.handles.data.get("same")?.get("value")).toBe("B");
            expect(a.handles.data.get("same")?.get("value")).toBe("A");
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            view.unmount();
            relationSession.dispose();
            harness.dispose();
        }
    });
});
