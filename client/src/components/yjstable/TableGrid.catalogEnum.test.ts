import { createSqlCatalogObject } from "$shared/services/sqlCatalog";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
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

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("catalog ENUM Grid cells", { timeout: 60_000 }, () => {
    it("renders exact declaration-order labels through the production select-cell path", async () => {
        const doc = new Y.Doc({ guid: "catalog-enum-select-cell" });
        createSqlCatalogObject(
            doc as unknown as Parameters<typeof createSqlCatalogObject>[0],
            "enum",
            "CREATE TYPE task_state AS ENUM ('Open', '', ' Done ')",
        );
        const tableId = createTable(doc, "Tasks", "tasks");
        const handles = getTableHandles(doc, tableId)!;
        setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(handles, { state: "Open" }, "r1");
        addRecord(handles, { state: "Open" }, "r2");
        const session = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            const result = await acquired!.adapter.runQueryNow("SELECT id, state FROM tasks");
            const schema = acquired!.adapter.appliedSchema;
            expect(schema?.columns[1]?.enumLabels).toEqual(["Open", "", " Done "]);
            const view = render(TableGrid, {
                props: {
                    handles,
                    adapter: acquired!.adapter,
                    schema,
                    query: "SELECT id, state FROM tasks",
                    result: result!,
                    componentTypes: {},
                    columnLabels: {},
                    hiddenColumns: { id: true },
                    columnOrder: ["state"],
                    session,
                },
            });

            const selects = view.container.querySelectorAll<HTMLSelectElement>("td[data-col='state'] select");
            expect(selects).toHaveLength(2);
            expect([...selects[0].options].slice(1).map(option => option.value)).toEqual(["Open", "", " Done "]);
            await fireEvent.change(selects[0], { target: { value: " Done " } });
            await waitFor(() => expect(handles.data.get("r1")?.get("state")).toBe(" Done "));
            await session.catalogReady();
            await waitFor(() => expect(acquired!.adapter.appliedSchema).toBeDefined());
            await fireEvent.change(selects[1], { target: { value: "" } });
            await waitFor(() => expect(handles.data.get("r2")?.get("state")).toBe(""));
            view.unmount();
        } finally {
            session.dispose();
        }
    });
});
