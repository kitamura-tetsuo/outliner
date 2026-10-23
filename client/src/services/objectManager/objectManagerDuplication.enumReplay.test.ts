import { Project } from "$shared/app-schema";
import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridRegistry } from "../yjstable/gridDocs";
import { captureDuplicationPlacement } from "../yjstable/gridPlacement";
import {
    createTable,
    getTableHandles,
    getTableRegistry,
    listTables,
    TABLE_SCHEMA_KEY,
    type TableRecordValue,
} from "../yjstable/tableDocs";
import { duplicateSelectedObjects, getObjects } from "./objectManagerController";

const transport = vi.hoisted(() => ({
    acquired: [] as { projectId: string; tableId: string; doc: unknown; }[],
    disposed: 0,
    sync: async () => ({ synced: true }),
}));
// Control only the remote Table-room handshake. Catalog analysis, hydration
// callers, materialization, placement, Yjs history and the router remain real.
vi.mock("../../lib/yjs/connection", () => ({
    connectTableDoc: async (projectId: string, tableId: string, doc: unknown) => {
        transport.acquired.push({ projectId, tableId, doc });
        return {
            waitForInitialSync: () => transport.sync(),
            dispose: async () => {
                transport.disposed++;
            },
        };
    },
}));

function signal() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
const projects: Project[] = [];
const managers: Y.UndoManager[] = [];
function project(title: string) {
    const value = Project.createInstance(title);
    projects.push(value);
    const enumId = createSqlCatalogObject(value.ydoc, "enum", "CREATE TYPE mood AS ENUM ('Open', 'Closed')");
    return { value, enumId };
}
function snapshot(project: Project) {
    return {
        document: Array.from(Y.encodeStateAsUpdate(project.ydoc)),
        tables: listTables(project.ydoc).map(table => ({
            id: table.tableId,
            document: Array.from(Y.encodeStateAsUpdate(getTableHandles(project.ydoc, table.tableId)!.doc)),
        })),
    };
}
function history() {
    return {
        router: [globalUndoRouter.undoDepth, globalUndoRouter.redoDepth],
        native: managers.map(manager => [manager.undoStack.length, manager.redoStack.length]),
    };
}
async function settled() {
    await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false), { timeout: 30_000 });
}
beforeEach(() => {
    globalUndoRouter.clear();
    transport.acquired = [];
    transport.disposed = 0;
    transport.sync = async () => ({ synced: true });
});
afterEach(() => {
    for (const manager of managers.splice(0)) {
        globalUndoRouter.unregister(manager);
        manager.destroy();
    }
    for (const project of projects.splice(0)) project.ydoc.destroy();
    globalUndoRouter.clear();
});

describe("Object Manager retained ENUM evidence through Redo hydration", { timeout: 60_000 }, () => {
    it.each(["unchanged", "reordered", "unavailable"] as const)(
        "retains the original witness and disposes Table rooms after hydration: catalog=%s",
        async catalogState => {
            const source = project("hydrated-enum-source");
            const destination = project("hydrated-enum-destination");
            const tableId = createTable(source.value.ydoc, "Tasks", "tasks", handles => {
                handles.schemaText.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state mood)");
                const row = new Y.Map<TableRecordValue>();
                row.set("id", "one");
                row.set("state", "Open");
                handles.data.set("one", row);
            });
            const table = getTableHandles(source.value.ydoc, tableId)!;
            const gridId = createGrid(source.value.ydoc, { query: "SELECT id, state FROM tasks" });
            const page = destination.value.addPage("Dashboard", "author");
            for (const { value } of [source, destination]) {
                const manager = new Y.UndoManager([
                    getTableRegistry(value.ydoc),
                    getGridRegistry(value.ydoc),
                    value.ydoc.getMap("orderedTree"),
                ]);
                globalUndoRouter.register(manager);
                managers.push(manager);
            }
            table.undo.clear();
            managers.push(table.undo);
            globalUndoRouter.clear();
            const result = await duplicateSelectedObjects(
                source.value.ydoc,
                destination.value.ydoc,
                getObjects(source.value).filter(object => object.id === tableId || object.id === gridId),
                {
                    copyTableData: true,
                    synchronizeTableSubdocs: true,
                    ...captureDuplicationPlacement(destination.value.ydoc, page.id, "author"),
                },
            );
            expect(result!.enumAdmission.requiredEnums.map(value => ({ name: value.name, labels: value.labels })))
                .toEqual([{ name: "mood", labels: ["Open", "Closed"] }]);
            const createdIds = result!.createdObjects.map(object => object.id).sort();
            expect([...page.items]).toHaveLength(1);
            globalUndoRouter.undo();
            await settled();
            expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied");
            expect(getObjects(destination.value)).toEqual([]);
            expect([...page.items]).toHaveLength(0);
            expect(transport.acquired).toHaveLength(2);
            expect(transport.disposed).toBe(2);

            const entered = signal();
            const release = signal();
            transport.sync = async () => {
                entered.resolve();
                await release.promise;
                return { synced: true };
            };
            const publications: string[] = [];
            for (const { value } of [source, destination]) {
                getTableRegistry(value.ydoc).observe(() => publications.push("Table"));
                getGridRegistry(value.ydoc).observe(() => publications.push("Grid"));
                value.ydoc.getMap("orderedTree").observeDeep(() => publications.push("placement"));
            }
            table.data.observeDeep(() => publications.push("source row"));
            const beforeHistory = history();
            globalUndoRouter.redo();
            await entered.promise;
            // The controller's first witness comparison has passed. Only the
            // post-hydration check can reject a new, mutually compatible meaning.
            expect(globalUndoRouter.isPending).toBe(true);
            expect(transport.acquired).toHaveLength(3);
            expect(transport.acquired[2]).toEqual({ projectId: source.value.ydoc.guid, tableId, doc: table.doc });
            if (catalogState === "reordered") {
                for (const { value, enumId } of [source, destination]) {
                    value.ydoc.transact(() => {
                        replaceSqlCatalogSource(value.ydoc, enumId, "CREATE TYPE mood AS ENUM ('Closed', 'Open')");
                    }, "peer-provider");
                }
            } else if (catalogState === "unavailable") {
                source.value.ydoc.transact(() => {
                    source.value.ydoc.getMap("sqlCatalog").set("format", "malformed");
                }, "peer-provider");
            }
            const beforeSource = snapshot(source.value);
            const beforeDestination = snapshot(destination.value);
            expect(history()).toEqual(beforeHistory);
            release.resolve();
            await settled();
            expect(snapshot(source.value)).toEqual(beforeSource);
            expect(history().native).toEqual(beforeHistory.native);
            if (catalogState !== "unchanged") {
                expect(globalUndoRouter.lastAsyncOutcome).toEqual({
                    status: "refused",
                    reason: catalogState === "reordered"
                        ? "SQL ENUM admission changed since duplication."
                        : "SQL catalog dependency evidence is unavailable.",
                });
                expect(publications).toEqual([]);
                expect(snapshot(destination.value)).toEqual(beforeDestination);
                expect(history()).toEqual(beforeHistory);
            } else {
                expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied");
                expect(getObjects(destination.value).map(object => object.id).sort()).toEqual(createdIds);
                const copiedTable = result!.createdObjects.find(object => object.type === "table")!;
                expect(getTableHandles(destination.value.ydoc, copiedTable.id)!.data.get("one")!.toJSON())
                    .toEqual({ id: "one", state: "Open" });
                expect([...page.items]).toHaveLength(1);
                expect(history().router).toEqual([beforeHistory.router[0] + 1, beforeHistory.router[1] - 1]);
            }
            expect(transport.disposed).toBe(catalogState === "unchanged" ? 4 : 3);
        },
    );

    it.each([
        "SELECT id AS id, state AS state FROM tasks",
        "SELECT id AS id, state AS state FROM public.tasks",
        "WITH renamed AS (SELECT id AS id, state AS state FROM public.tasks) SELECT id AS id, state AS state FROM renamed",
    ])("hydrates a cold read dependency without expanding the Grid selection: %s", async query => {
        const source = project("cold-table-dependency");
        const tableId = createTable(source.value.ydoc, "Tasks", "tasks");
        const handles = getTableHandles(source.value.ydoc, tableId)!;
        const gridId = createGrid(source.value.ydoc, { query });
        const remote = new Y.Doc({ guid: handles.doc.guid });
        remote.getText(TABLE_SCHEMA_KEY).insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state mood)");
        const update = Y.encodeStateAsUpdate(remote);
        remote.destroy();
        expect(handles.schemaText.toString()).toBe("");
        transport.sync = async () => {
            Y.applyUpdate(handles.doc, update, "peer-provider");
            return { synced: true };
        };
        const result = await duplicateSelectedObjects(
            source.value.ydoc,
            source.value.ydoc,
            getObjects(source.value).filter(object => object.id === gridId),
            { synchronizeTableSubdocs: true },
        );
        expect(transport.acquired).toEqual([{ projectId: source.value.ydoc.guid, tableId, doc: handles.doc }]);
        expect(transport.disposed).toBe(1);
        expect(result!.enumAdmission.requiredEnums.map(value => value.name)).toEqual(["mood"]);
        expect(result!.createdObjects).toEqual([{ type: "grid", id: expect.any(String) }]);
        expect(result!.createdObjects[0].id).not.toBe(gridId);
        expect(listTables(source.value.ydoc).map(table => table.tableId)).toEqual([tableId]);
        expect(getGridRegistry(source.value.ydoc).get(result!.createdObjects[0].id)!.get("query")).toBe(query);
    });

    it("hydrates cold foreign-key dependencies without adding Tables to the selection", async () => {
        const source = project("cold-foreign-key-dependency");
        const remoteUpdates = new Map<string, Uint8Array>();
        const tableIds = [
            ["child", "CREATE TABLE child (id TEXT PRIMARY KEY, parent_state mood REFERENCES public.parent(state))"],
            ["parent", "CREATE TABLE parent (state mood PRIMARY KEY)"],
        ].map(([name, schema]) => {
            const tableId = createTable(source.value.ydoc, name, name);
            const handles = getTableHandles(source.value.ydoc, tableId)!;
            const remote = new Y.Doc({ guid: handles.doc.guid });
            remote.getText(TABLE_SCHEMA_KEY).insert(0, schema);
            remoteUpdates.set(tableId, Y.encodeStateAsUpdate(remote));
            remote.destroy();
            expect(handles.schemaText.toString()).toBe("");
            return tableId;
        });
        const query = "SELECT id AS id, parent_state AS parent_state FROM child";
        const gridId = createGrid(source.value.ydoc, { query });
        transport.sync = async () => {
            const acquired = transport.acquired.at(-1)!;
            const handles = getTableHandles(source.value.ydoc, acquired.tableId)!;
            expect(acquired).toEqual({
                projectId: source.value.ydoc.guid,
                tableId: acquired.tableId,
                doc: handles.doc,
            });
            Y.applyUpdate(handles.doc, remoteUpdates.get(acquired.tableId)!, "peer-provider");
            return { synced: true };
        };
        const result = await duplicateSelectedObjects(
            source.value.ydoc,
            source.value.ydoc,
            getObjects(source.value).filter(object => object.id === gridId),
            { synchronizeTableSubdocs: true },
        );
        expect(transport.acquired.map(connection => connection.tableId)).toEqual(tableIds);
        expect(transport.disposed).toBe(2);
        expect(result!.enumAdmission.sourceDescriptor.tables.map(table => table.id).sort()).toEqual(
            [...tableIds].sort(),
        );
        expect(result!.enumAdmission.requiredEnums.map(value => ({ name: value.name, labels: value.labels })))
            .toEqual([{ name: "mood", labels: ["Open", "Closed"] }]);
        expect(result!.sourceObjects).toEqual([{ type: "grid", id: gridId }]);
        expect(result!.createdObjects).toEqual([{ type: "grid", id: expect.any(String) }]);
        expect(result!.createdObjects[0].id).not.toBe(gridId);
        expect(listTables(source.value.ydoc).map(table => table.tableId)).toEqual(tableIds);
        expect(getGridRegistry(source.value.ydoc).get(result!.createdObjects[0].id)!.get("query")).toBe(query);
    });
});
