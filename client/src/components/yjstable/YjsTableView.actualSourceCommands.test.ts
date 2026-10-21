import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, setGridColumnOrder } from "../../services/yjstable/gridDocs";
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
    it("clears and pastes into the actual B supplier without touching A", async () => {
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
        const gridId = createGrid(projectDoc, { name: "Grid", query: "SELECT id, value FROM b" });
        const grid = getGridHandles(projectDoc, gridId)!;
        const readText = vi.fn().mockResolvedValue("Pasted B");
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
        const view = render(YjsTableView, {
            props: { grid, projectDoc },
        });
        try {
            const cell = () =>
                view.getByTestId("yjs-table-view").querySelector<HTMLElement>(
                    "tr[data-record-id='same'] td[data-col='value']",
                );
            await waitFor(() => expect(cell()?.querySelector("button")?.textContent).toBe("B value"), {
                timeout: 30_000,
            });
            await waitFor(() => expect(view.queryByTestId("grid-readonly-reason")).toBeNull());

            await fireEvent.click(cell()!);
            await fireEvent.keyDown(cell()!.querySelector("button")!, { key: "Delete" });
            await waitFor(() => expect(handlesB.data.get("same")?.get("value")).toBe(null));
            await waitFor(() => expect(cell()?.querySelector("button")?.textContent).toBe(""));
            expect(handlesA.data.get("same")?.get("value")).toBe("A value");
            await waitFor(() => expect(view.queryByTestId("grid-readonly-reason")).toBeNull());

            await fireEvent.click(cell()!);
            await fireEvent.keyDown(cell()!.querySelector("button")!, { key: "v", ctrlKey: true });
            await waitFor(() => expect(handlesB.data.get("same")?.get("value")).toBe("Pasted B"));
            expect(handlesA.data.get("same")?.get("value")).toBe("A value");
            expect(handlesA.undo.undoStack).toHaveLength(0);
            await waitFor(() => expect(cell()?.querySelector("button")?.textContent).toBe("Pasted B"));
            await waitFor(() =>
                expect(view.getByTestId("yjs-table-view").getAttribute("data-mutation-incarnation")).not.toContain(
                    "unavailable",
                )
            );
            const historyBeforePaste = handlesB.undo.undoStack.length;
            let releaseClipboard!: (value: string) => void;
            readText.mockImplementationOnce(() => new Promise<string>(resolve => releaseClipboard = resolve));
            await fireEvent.click(cell()!);
            await fireEvent.keyDown(cell()!.querySelector("button")!, { key: "v", ctrlKey: true });
            expect(readText).toHaveBeenCalledTimes(2);
            // A pending clipboard read cannot reinterpret coordinates after a
            // real Grid presentation writer reorders the visible columns.
            setGridColumnOrder(grid, ["value", "id"]);
            await waitFor(() =>
                expect(view.container.querySelector("th[data-col]")?.getAttribute("data-col")).toBe("value")
            );
            releaseClipboard("retargeted paste");
            await waitFor(() => expect(view.getByTestId("grid-paste-status").textContent).toContain("Paste cancelled"));
            expect(handlesB.data.get("same")?.get("value")).toBe("Pasted B");
            expect(handlesA.data.get("same")?.get("value")).toBe("A value");
            expect(handlesB.undo.undoStack).toHaveLength(historyBeforePaste);
        } finally {
            view.unmount();
            await waitForTableEngineIdle();
        }
    });
});
