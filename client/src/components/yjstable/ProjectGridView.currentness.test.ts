import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { gridSearchMatches, replaceGridMatch } from "../../lib/search/unifiedSearch";
import { createGrid, getGridHandles, removeGrid, setGridQuery } from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import ProjectGridView from "./ProjectGridView.svelte";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());
const options = { caseSensitive: false, wholeWord: false, regex: false };

it(
    "revokes old matches and pending editors while newly initiated peer-refresh actions work",
    { timeout: 60000 },
    async () => {
        const projectDoc = new Y.Doc({ guid: "grid-currentness" });
        const id = createTable(projectDoc, "A", "a");
        const handles = getTableHandles(projectDoc, id)!;
        setSchemaText(handles, "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)");
        addRecord(handles, { value: "needle" }, "same");
        const query = "SELECT id AS id, value AS value FROM a";
        const grid = getGridHandles(projectDoc, createGrid(projectDoc, { query }))!;
        const view = render(ProjectGridView, { props: { grid, projectDoc, placementId: "placement", pageId: "page" } });
        const cell = () => view.container.querySelector('td[data-col="value"]')!;
        const find = (text: string) => gridSearchMatches("page", text, options);
        await waitFor(() => expect(find("needle")[0]?.replaceable).toBe(true), { timeout: 30000 });
        const old = find("needle")[0];
        // The actual data lives in its Table Y.Doc, whose origin marks a remote edit.
        handles.doc.transact(() => handles.data.get("same")!.set("value", "current needle"), "peer");
        await waitFor(() => expect(cell()?.textContent).toContain("current needle"));
        await expect(replaceGridMatch(old, "needle", "stale", options)).resolves.toMatchObject({ applied: false });
        await waitFor(() => expect(find("needle")[0]?.replaceable).toBe(true));
        const fresh = find("needle")[0];
        await expect(replaceGridMatch(fresh, "needle", "updated", options)).resolves.toMatchObject({ applied: true });
        await waitFor(() => expect(handles.data.get("same")?.get("value")).toBe("current updated"));
        await waitFor(() => expect(cell()?.textContent).toContain("current updated"));
        await fireEvent.click(cell().querySelector("button")!);
        const editor = cell().querySelector("input")!;
        await fireEvent.input(editor, { target: { value: "pending" } });
        setGridQuery(grid, `${query} WHERE id = 'same'`);
        await waitFor(() =>
            expect(view.getByTestId("yjs-table-view").getAttribute("data-mutation-incarnation")).not.toContain(
                "unavailable",
            )
        );
        await fireEvent.keyDown(editor, { key: "Enter" });
        expect(handles.data.get("same")?.get("value")).toBe("current updated");
        setGridQuery(grid, "SELECT 1 AS value");
        setGridQuery(grid, query);
        await fireEvent.keyDown(editor, { key: "Enter" });
        expect(handles.data.get("same")?.get("value")).toBe("current updated");
        await waitFor(() => expect(find("updated")[0]?.replaceable).toBe(true));
        const beforeDeletion = find("updated")[0];
        removeGrid(projectDoc, grid.gridId);
        await expect(replaceGridMatch(beforeDeletion, "updated", "orphan write", options)).resolves.toMatchObject({
            applied: false,
        });
        expect(handles.data.get("same")?.get("value")).toBe("current updated");
        view.unmount();
        projectDoc.destroy();
    },
);
