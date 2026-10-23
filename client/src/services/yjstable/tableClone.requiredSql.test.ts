import { Project } from "$shared/app-schema";
import { createSqlCatalogObject, readSqlCatalog } from "$shared/services/sqlCatalog";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, getGridRegistry } from "./gridDocs";
import { exportGridSlice, exportTableStructures, importTableStructures } from "./tableClone";
import { createTable, getTableHandles, getTableRegistry, listTables } from "./tableDocs";

describe("required selected SQL import preflight", () => {
    it.each(["", " \n\t "])("preserves an unconfigured Grid with complete empty admission: %j", async query => {
        const source = Project.createInstance("unconfigured-grid-source");
        const destination = Project.createInstance("unconfigured-grid-destination");
        const gridId = createGrid(source.ydoc, { query });
        const catalog = readSqlCatalog(source.ydoc.guid, source.ydoc);
        if (catalog.status !== "ready") throw new Error("Source catalog is unavailable");

        // Start at the import API with a portable definition. Export's
        // separate read-inventory policy still rejects unconfigured queries.
        const result = await importTableStructures(
            destination.ydoc,
            {},
            source.ydoc.guid,
            new Set(),
            false,
            {
                [gridId]: {
                    gridId,
                    name: "Unconfigured",
                    query,
                    components: {},
                    columnOrder: [],
                    tableIds: [],
                },
            },
            catalog.snapshot,
        );

        const copiedGridId = result.gridIdMap[gridId];
        expect(copiedGridId).toBeTruthy();
        expect(copiedGridId).not.toBe(gridId);
        expect(getGridRegistry(destination.ydoc).size).toBe(1);
        expect(getGridHandles(destination.ydoc, copiedGridId)!.entry.get("query")).toBe(query);
        expect(listTables(destination.ydoc)).toEqual([]);
        expect(result.enumAdmission.requiredEnums).toEqual([]);
        expect(result.enumAdmission.relevantSqlIds).toEqual([]);
        expect(result.enumAdmission.sourceDescriptor.tables).toEqual([]);
        expect(result.enumAdmission.sourceDescriptor.inspections).toEqual([]);
        source.ydoc.destroy();
        destination.ydoc.destroy();
    });

    it.each([false, true])(
        "admits selected Calendar SQL before Table/Grid publication; qualified=%s",
        async qualified => {
            const source = Project.createInstance("required-calendar-source");
            const destination = Project.createInstance("required-calendar-destination");
            for (const project of [source, destination]) {
                createSqlCatalogObject(project.ydoc, "enum", "CREATE TYPE mood AS ENUM ('Open', 'Closed')");
            }
            const tableId = createTable(source.ydoc, "Tasks", "tasks", handles => {
                handles.schemaText.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state mood)");
            });
            const gridId = createGrid(source.ydoc, { query: "SELECT id FROM tasks" });
            const tables = exportTableStructures(source.ydoc, [tableId]);
            const grids = { [gridId]: exportGridSlice(source.ydoc, gridId) };
            const calendarSql = `SELECT id, state FROM ${qualified ? "public.tasks" : "tasks"}`;
            const events: string[] = [];
            getTableRegistry(destination.ydoc).observe(() => events.push("Table"));
            getGridRegistry(destination.ydoc).observe(() => events.push("Grid"));
            destination.ydoc.on("subdocs", () => events.push("subdoc"));
            destination.ydoc.on("update", () => events.push("Project"));
            const before = Array.from(Y.encodeStateAsUpdate(destination.ydoc));
            const sourceSchema = getTableHandles(source.ydoc, tableId)!.schemaText.toString();

            const importing = importTableStructures(
                destination.ydoc,
                tables,
                source.ydoc.guid,
                new Set([tableId]),
                false,
                grids,
                undefined,
                () => {},
                [{ id: "calendar", kind: "calendar", sql: calendarSql }],
            );
            if (qualified) {
                await expect(importing).rejects.toThrow(/Schema-qualified relation/);
                expect(events).toEqual([]);
                expect(Array.from(Y.encodeStateAsUpdate(destination.ydoc))).toEqual(before);
                expect(listTables(destination.ydoc)).toEqual([]);
                expect(getGridRegistry(destination.ydoc).size).toBe(0);
            } else {
                const result = await importing;
                expect(listTables(destination.ydoc).map(table => table.tableId)).toEqual([result.tableIdMap[tableId]]);
                expect(getGridRegistry(destination.ydoc).size).toBe(1);
                expect(getGridHandles(destination.ydoc, result.gridIdMap[gridId])!.entry.get("query"))
                    .toBe("SELECT id FROM tasks");
                expect(result.enumAdmission.sourceDescriptor.inspections).toEqual(expect.arrayContaining([
                    { id: "calendar", kind: "calendar", sql: calendarSql },
                ]));
                expect(result.enumAdmission.requiredEnums.map(value => ({ name: value.name, labels: value.labels })))
                    .toEqual([{ name: "mood", labels: ["Open", "Closed"] }]);
            }
            expect(getTableHandles(source.ydoc, tableId)!.schemaText.toString()).toBe(sourceSchema);
            source.ydoc.destroy();
            destination.ydoc.destroy();
        },
        30_000,
    );
});
