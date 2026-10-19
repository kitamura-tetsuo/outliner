import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createMutationHarness, createTestTable } from "../../services/yjstable/gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord } from "../../services/yjstable/tableDocs";
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

describe("readable Grid projections without write identity", { timeout: 30_000 }, () => {
    it("selects, navigates and copies occurrences while Delete explicitly has no effect", async () => {
        const doc = new Y.Doc({ guid: "readable-projection" });
        const table = createTestTable(doc, "b", schema.createSql, "one", { value: "Alpha" });
        addRecord(table.handles, { value: "Beta" }, "two");
        table.handles.undo.clear();
        const harness = await createMutationHarness(doc, "SELECT value FROM b ORDER BY value");
        const session = createTableEngineSession({ projectDoc: doc });
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        const view = render(TableGrid, {
            props: {
                handles: table.handles,
                schema,
                query: "SELECT value FROM b ORDER BY value",
                result: { columns: ["value"], rows: harness.evidence().rows },
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: {},
                columnOrder: ["value"],
                session,
                mutationBoundary: harness.boundary,
            },
        });
        try {
            const cells = Array.from(view.container.querySelectorAll<HTMLElement>("td[data-col='value']"));
            await fireEvent.click(cells[0]!);
            await fireEvent.click(cells[1]!, { shiftKey: true });
            await fireEvent.keyDown(cells[1]!.querySelector("button")!, { key: "c", ctrlKey: true });
            await waitFor(() => expect(writeText).toHaveBeenCalledWith("Alpha\nBeta"));

            await fireEvent.keyDown(cells[1]!.querySelector("button")!, { key: "ArrowUp" });
            expect(cells[0]!.classList.contains("grid-active")).toBe(true);
            await fireEvent.keyDown(cells[0]!.querySelector("button")!, { key: "Delete" });
            await waitFor(() =>
                expect(view.getByTestId("grid-edit-status").textContent).toContain("no-writable-cells")
            );
            expect(table.handles.data.get("one")?.get("value")).toBe("Alpha");
            expect(table.handles.data.get("two")?.get("value")).toBe("Beta");
            expect(table.handles.undo.undoStack).toHaveLength(0);
        } finally {
            view.unmount();
            session.dispose();
            harness.dispose();
        }
    });
});
