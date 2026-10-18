import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { createGrid, getGridHandles, setGridQuery } from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import ProjectGridView from "./ProjectGridView.svelte";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

it("retains Grid query and A cell history through a live supplier switch", { timeout: 60000 }, async () => {
    const projectDoc = new Y.Doc({ guid: "grid-live-history" });
    const sources = ["a", "b"].map(name => {
        const id = createTable(projectDoc, name.toUpperCase(), name);
        const handles = getTableHandles(projectDoc, id)!;
        setSchemaText(handles, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, value TEXT)`);
        addRecord(handles, { value: name }, "same");
        return handles;
    });
    const grid = getGridHandles(
        projectDoc,
        createGrid(projectDoc, undefined, { name: "Independent", query: "SELECT id AS id, value AS value FROM a" }),
    )!;
    const view = render(ProjectGridView, { props: { grid, projectDoc } });
    const cell = () => view.container.querySelector('td[data-col="value"]')!;
    await waitFor(() => expect(cell()?.querySelector("button")?.textContent?.trim()).toBe("a"), { timeout: 30000 });
    sources.forEach(source => source.undo.clear());
    grid.undo.clear();
    globalUndoRouter.clear();
    await fireEvent.click(cell().querySelector("button")!);
    await fireEvent.input(cell().querySelector("input")!, { target: { value: "edited-a" } });
    await fireEvent.keyDown(cell().querySelector("input")!, { key: "Enter" });
    await waitFor(() => expect(sources[0].data.get("same")?.get("value")).toBe("edited-a"));
    expect(sources[0].undo.undoStack).toHaveLength(1);
    setGridQuery(grid, "SELECT id AS id, value AS value FROM b");
    await waitFor(() => expect(cell()?.querySelector("button")?.textContent?.trim()).toBe("b"), { timeout: 30000 });
    await waitFor(() =>
        expect(view.getByTestId("yjs-table-view")).toHaveAttribute("data-source-table-id", sources[1].tableId)
    );
    expect(globalUndoRouter.undoDepth).toBe(2);
    expect(grid.undo.undoStack).toHaveLength(1);
    expect(sources[0].undo.undoStack).toHaveLength(1);
    globalUndoRouter.undo();
    await waitFor(() => expect(cell()?.querySelector("button")?.textContent?.trim()).toBe("edited-a"));
    globalUndoRouter.undo();
    await waitFor(() => expect(cell()?.querySelector("button")?.textContent?.trim()).toBe("a"));
    view.unmount();
    expect(globalUndoRouter.redoDepth).toBe(2);
    projectDoc.destroy();
    expect(globalUndoRouter.redoDepth).toBe(0);
});
