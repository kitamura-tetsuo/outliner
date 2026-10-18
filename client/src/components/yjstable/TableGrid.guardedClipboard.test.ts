import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it } from "vitest";
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

describe("mounted guarded Grid clipboard dispatch", { timeout: 30_000 }, () => {
    it("refuses a held clipboard result after the displayed result generation changes", async () => {
        const doc = new Y.Doc({ guid: "mounted-guarded-clipboard" });
        const table = createTestTable(doc, "b", schema.createSql, "one", { value: "before" });
        const harness = await createMutationHarness(doc, "SELECT id, value FROM b");
        const relationSession = createTableEngineSession({ projectDoc: doc });
        let releaseClipboard: (text: string) => void = () => {};
        const heldClipboard = new Promise<string>(resolve => releaseClipboard = resolve);
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        // Browser clipboard timing is the only replaced boundary; selection,
        // planning, authority and the provider/Yjs records are all production instances.
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { readText: () => heldClipboard },
        });
        const props = {
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
        };
        const view = render(TableGrid, { props });
        try {
            const cell = view.container.querySelector<HTMLElement>("td[data-row-id='one'][data-col='value']")!;
            await fireEvent.click(cell);
            await fireEvent.keyDown(cell.querySelector("button")!, { key: "v", ctrlKey: true });

            await view.rerender({ ...props, result: { ...props.result, rows: [...props.result.rows] } });
            releaseClipboard("after");

            await waitFor(() => expect(view.getByTestId("grid-paste-status").textContent).toContain("changed"));
            expect(table.handles.data.get("one")?.get("value")).toBe("before");
            expect(table.handles.undo.undoStack).toHaveLength(0);
        } finally {
            view.unmount();
            relationSession.dispose();
            harness.dispose();
            if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
            else delete (navigator as { clipboard?: Clipboard; }).clipboard;
        }
    });
});
