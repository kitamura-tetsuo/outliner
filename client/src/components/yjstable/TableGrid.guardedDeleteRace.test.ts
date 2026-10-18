import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it } from "vitest";
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

describe("mounted guarded Delete preparation", { timeout: 30_000 }, () => {
    it.each(["row", "cell"] as const)("refuses when a row selection changes to a %s selection", async (next) => {
        const doc = new Y.Doc({ guid: `guarded-delete-race-${next}` });
        const table = createTestTable(doc, "b", schema.createSql, "one", { value: "first" });
        addRecord(table.handles, { value: "second" }, "two");
        table.handles.undo.clear();
        const harness = await createMutationHarness(doc, "SELECT id, value FROM b ORDER BY id");
        const session = createTableEngineSession({ projectDoc: doc });
        let releasePreparation = () => {};
        const preparation = new Promise<void>(resolve => releasePreparation = resolve);
        const view = render(TableGrid, {
            props: {
                handles: table.handles,
                schema,
                query: "SELECT id, value FROM b ORDER BY id",
                result: { columns: ["id", "value"], rows: harness.evidence().rows },
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: { id: true },
                columnOrder: ["value"],
                session,
                mutationBoundary: harness.boundary,
                prepareMutationAuthority: () => preparation,
            },
        });
        try {
            const headers = view.getAllByRole("rowheader");
            await fireEvent.click(headers[0]!);
            await fireEvent.keyDown(headers[0]!, { key: "Delete" });
            if (next === "row") await fireEvent.click(headers[1]!);
            else {
                const cell = view.container.querySelector<HTMLElement>("td[data-row-id='two'][data-col='value']")!;
                await fireEvent.click(cell);
            }
            releasePreparation();

            await waitFor(() =>
                expect(view.getByTestId("grid-edit-status").textContent).toContain("selection changed")
            );
            expect(table.handles.data.has("one")).toBe(true);
            expect(table.handles.data.has("two")).toBe(true);
            expect(table.handles.data.get("two")?.get("value")).toBe("second");
            expect(table.handles.undo.undoStack).toHaveLength(0);
        } finally {
            view.unmount();
            session.dispose();
            harness.dispose();
        }
    });
});
