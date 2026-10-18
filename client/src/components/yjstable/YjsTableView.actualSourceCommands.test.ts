import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests, waitForTableEngineIdle } from "../../services/yjstable/tableEngine";
import YjsTableView from "./YjsTableView.svelte";

vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((module) => module.fakeMonaco),
}));

afterEach(async () => {
    vi.unstubAllGlobals();
    await resetTableEngineForTests();
});
afterAll(async () => await resetPgliteForTests());

describe("saved Grid commands use the verified actual source", { timeout: 60_000 }, () => {
    it("clears and pastes into B when the Grid primary Table is A", async () => {
        const projectDoc = new Y.Doc({ guid: "actual-source-grid" });
        const tableA = createTable(projectDoc, "Table A", "a");
        const tableB = createTable(projectDoc, "Table B", "b");
        const handlesA = getTableHandles(projectDoc, tableA)!;
        const handlesB = getTableHandles(projectDoc, tableB)!;
        const schema = "CREATE TABLE source (id TEXT PRIMARY KEY, value TEXT)";
        setSchemaText(handlesA, schema.replace("source", "a"));
        setSchemaText(handlesB, schema.replace("source", "b"));
        addRecord(handlesA, { value: "A value" }, "same");
        addRecord(handlesB, { value: "B value" }, "same");
        handlesA.undo.clear();
        handlesB.undo.clear();
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, value FROM b" });
        const grid = getGridHandles(projectDoc, gridId)!;
        const readText = vi.fn().mockResolvedValue("Pasted B");
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
        const view = render(YjsTableView, {
            props: { grid, handles: handlesA, projectDoc, tableName: "Table A", sqlName: "a" },
        });
        try {
            const cell = () =>
                view.getByTestId("yjs-table-view").querySelector<HTMLElement>(
                    "tr[data-record-id='same'] td[data-col='value']",
                );
            await waitFor(() => expect(cell()?.querySelector("button")?.textContent).toBe("B value"), {
                timeout: 30_000,
            });
            expect(view.queryByTestId("grid-readonly-reason")).toBeNull();

            await fireEvent.click(cell()!);
            await fireEvent.keyDown(cell()!.querySelector("button")!, { key: "Delete" });
            await waitFor(() => expect(handlesB.data.get("same")?.get("value")).toBe(null));
            await waitFor(() => expect(cell()?.querySelector("button")?.textContent).toBe(""));
            expect(handlesA.data.get("same")?.get("value")).toBe("A value");

            await fireEvent.click(cell()!);
            await fireEvent.keyDown(cell()!.querySelector("button")!, { key: "v", ctrlKey: true });
            await waitFor(() => expect(handlesB.data.get("same")?.get("value")).toBe("Pasted B"));
            expect(handlesA.data.get("same")?.get("value")).toBe("A value");
            expect(handlesA.undo.undoStack).toHaveLength(0);
        } finally {
            view.unmount();
            await waitForTableEngineIdle();
        }
    });
});
