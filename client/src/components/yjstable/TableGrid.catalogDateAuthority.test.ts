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

// The cell callback, adapter, compiler and PGlite all execute production code.
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

async function setup() {
    const doc = new Y.Doc({ guid: "catalog-date-cell-authority" });
    const catalogDoc = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
    const catalogId = createSqlCatalogObject(
        catalogDoc,
        "enum",
        "CREATE TYPE delivery_day AS ENUM ('2026-10-10', '2026-10-11')",
    );
    const tableId = createTable(doc, "Deliveries", "deliveries");
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, "CREATE TABLE deliveries (id TEXT PRIMARY KEY, day delivery_day)");
    addRecord(handles, { day: "2026-10-10" }, "r1");
    const session = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect: localConnector });
    const { adapter } = (await session.acquire(tableId))!;
    const query = "SELECT id, day FROM deliveries";
    const result = (await adapter.runQueryNow(query))!;
    const view = render(TableGrid, {
        props: {
            handles,
            adapter,
            schema: adapter.appliedSchema,
            query,
            result,
            componentTypes: { day: "date" },
            columnLabels: {},
            hiddenColumns: { id: true },
            columnOrder: ["day"],
            session,
        },
    });
    cleanups.push(() => {
        view.unmount();
        session.dispose();
    });
    const input = view.container.querySelector<HTMLInputElement>("td[data-col='day'] input[type='date']")!;
    expect(input).not.toBeNull();
    return {
        handles,
        adapter,
        view,
        input,
        async reorder() {
            const token = adapter.writeAuthorityToken;
            replaceSqlCatalogSource(
                catalogDoc,
                catalogId,
                "CREATE TYPE delivery_day AS ENUM ('2026-10-11', '2026-10-10')",
            );
            await expect.poll(() => adapter.appliedSchema?.columns[1]?.enumLabels, { timeout: 60_000 })
                .toEqual(["2026-10-11", "2026-10-10"]);
            expect(adapter.writeAuthorityToken).not.toBe(token);
        },
    };
}

describe("catalog authority through native date cells", { timeout: 90_000 }, () => {
    it("accepts a fresh exact date label through the actual field writer", async () => {
        const f = await setup();
        await fireEvent.focus(f.input);
        await fireEvent.change(f.input, { target: { value: "2026-10-11" } });
        expect(f.handles.data.get("r1")?.get("day")).toBe("2026-10-11");
        expect(f.view.queryByTestId("grid-edit-status")).toBeNull();
    });

    it.each(["focus", "pointer", "keyboard"])(
        "rejects a stale %s-started date edit and permits a fresh interaction",
        async start => {
            const f = await setup();
            if (start === "focus") await fireEvent.focus(f.input);
            else if (start === "pointer") await fireEvent.pointerDown(f.input);
            else await fireEvent.keyDown(f.input, { key: "ArrowDown" });
            await f.reorder();
            await fireEvent.keyDown(f.input, { key: "ArrowDown" });
            await fireEvent.change(f.input, { target: { value: "2026-10-11" } });
            expect(f.handles.data.get("r1")?.get("day")).toBe("2026-10-10");
            expect(f.view.getByTestId("grid-edit-status").textContent).toContain("changed while you were editing");

            await fireEvent.keyDown(f.input, { key: "ArrowDown" });
            await fireEvent.change(f.input, { target: { value: "2026-10-11" } });
            expect(f.handles.data.get("r1")?.get("day")).toBe("2026-10-11");
            expect(f.view.queryByTestId("grid-edit-status")).toBeNull();
        },
    );
});
