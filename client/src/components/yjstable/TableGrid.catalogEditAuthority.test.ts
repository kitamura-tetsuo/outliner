import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { fireEvent, render } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
} from "../../services/yjstable/tableEngine";
import TableGrid from "./TableGrid.svelte";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});
const cleanups: Array<() => void> = [];
afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    await resetTableEngineForTests();
});
afterAll(resetPgliteForTests);

async function setup(component: "text" | "select", withNext = false) {
    const doc = new Y.Doc({ guid: "catalog-cell-edit-authority" });
    const catalogDoc = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
    const catalogId = createSqlCatalogObject(catalogDoc, "enum", "CREATE TYPE task_state AS ENUM ('Open', 'Closed')");
    const tableId = createTable(doc, "Tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(
        handles,
        `CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state${withNext ? ", next task_state" : ""})`,
    );
    addRecord(handles, withNext ? { state: "Open", next: "Open" } : { state: "Open" }, "r1");
    const session = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect: localConnector });
    const acquired = await session.acquire(tableId);
    const adapter = acquired!.adapter;
    const query = `SELECT id, state${withNext ? ", next" : ""} FROM tasks`;
    const result = (await adapter.runQueryNow(query))!;
    const view = render(TableGrid, {
        props: {
            handles,
            adapter,
            schema: adapter.appliedSchema,
            query,
            result,
            componentTypes: { state: component, next: "select" },
            columnLabels: {},
            hiddenColumns: { id: true },
            columnOrder: withNext ? ["state", "next"] : ["state"],
            session,
        },
    });
    cleanups.push(() => {
        view.unmount();
        session.dispose();
    });
    const cell = () => view.container.querySelector<HTMLElement>("td[data-col='state']")!;
    return {
        handles,
        adapter,
        session,
        view,
        cell,
        async reorder() {
            const token = adapter.writeAuthorityToken;
            replaceSqlCatalogSource(catalogDoc, catalogId, "CREATE TYPE task_state AS ENUM ('Closed', 'Open')");
            await expect.poll(() => adapter.appliedSchema?.columns[1]?.enumLabels, { timeout: 60_000 })
                .toEqual(["Closed", "Open"]);
            expect(adapter.writeAuthorityToken).not.toBe(token);
        },
    };
}

describe("catalog authority through actual cell callbacks", { timeout: 90_000 }, () => {
    it("keeps the old editor's authority when the next control receives pointer-down before blur", async () => {
        const f = await setup("text", true);
        await fireEvent.click(f.cell().querySelector("button")!);
        const input = f.cell().querySelector<HTMLInputElement>("input")!;
        await fireEvent.input(input, { target: { value: "Closed" } });
        const next = f.view.container.querySelector<HTMLSelectElement>("td[data-col='next'] select")!;
        await fireEvent.pointerDown(next);
        await fireEvent.blur(input);
        expect(f.handles.data.get("r1")?.get("state")).toBe("Closed");
        expect(f.handles.data.get("r1")?.get("next")).toBe("Open");
    });

    it.each(["click", "F2", "printable"])(
        "rejects the stale %s-started text edit and accepts a fresh edit",
        async start => {
            const f = await setup("text");
            const button = f.cell().querySelector("button")!;
            if (start === "click") await fireEvent.click(button);
            else await fireEvent.keyDown(button, { key: start === "F2" ? "F2" : "C" });
            const input = f.cell().querySelector<HTMLInputElement>("input")!;
            expect(input).not.toBeNull();
            await fireEvent.input(input, { target: { value: "Closed" } });
            await f.reorder();
            await fireEvent.keyDown(input, { key: "Enter" });
            expect(f.handles.data.get("r1")?.get("state")).toBe("Open");
            expect(f.view.getByTestId("grid-edit-status").textContent).toContain("changed while you were editing");
            await fireEvent.click(f.cell().querySelector("button")!);
            const fresh = f.cell().querySelector<HTMLInputElement>("input")!;
            await fireEvent.input(fresh, { target: { value: "Closed" } });
            await fireEvent.keyDown(fresh, { key: "Enter" });
            expect(f.handles.data.get("r1")?.get("state")).toBe("Closed");
        },
    );

    it("keeps the original ENUM authority after the current column becomes TEXT", async () => {
        const f = await setup("text");
        await fireEvent.click(f.cell().querySelector("button")!);
        const input = f.cell().querySelector<HTMLInputElement>("input")!;
        await fireEvent.input(input, { target: { value: "Closed" } });
        const token = f.adapter.writeAuthorityToken;
        setSchemaText(f.handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state TEXT)");
        await expect.poll(() => f.adapter.appliedSchema?.columns[1]?.dataType, { timeout: 60_000 }).toBe("text");
        expect(f.adapter.writeAuthorityToken).not.toBe(token);
        await f.view.rerender({ schema: f.adapter.appliedSchema });
        await fireEvent.blur(input);
        expect(f.handles.data.get("r1")?.get("state")).toBe("Open");
        expect(f.view.getByTestId("grid-edit-status").textContent).toContain("changed while you were editing");
    });

    it.each(["focus", "pointer", "keyboard"])(
        "retains native select authority from %s through a delayed change",
        async start => {
            const f = await setup("select");
            const select = f.cell().querySelector<HTMLSelectElement>("select")!;
            if (start === "focus") await fireEvent.focus(select);
            else if (start === "pointer") await fireEvent.pointerDown(select);
            else await fireEvent.keyDown(select, { key: "ArrowDown" });
            await f.reorder();
            await fireEvent.keyDown(select, { key: "ArrowDown" });
            await fireEvent.change(select, { target: { value: "Closed" } });
            expect(f.handles.data.get("r1")?.get("state")).toBe("Open");
            expect(f.view.getByTestId("grid-edit-status").textContent).toContain("changed while you were editing");
            await fireEvent.keyDown(select, { key: "ArrowDown" });
            await fireEvent.change(select, { target: { value: "Closed" } });
            expect(f.handles.data.get("r1")?.get("state")).toBe("Closed");
        },
    );
});
