import { Project } from "$shared/app-schema";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridRegistry, removeGridWithPlacements } from "../yjstable/gridDocs";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { exportGridSlice, exportTableStructures } from "../yjstable/tableClone";
import { addRecord, createTable, getTableHandles, listTables } from "../yjstable/tableDocs";
import { cloneGridTablesAcrossProjects } from "./crossProjectGridPaste";
import { GRID_PASTE_CANCEL_EVENT, GRID_PASTE_PROGRESS_EVENT, type GridPasteProgress } from "./gridPasteEvents";

// Controlled source transport only. Allocation, binding checks, copy and cleanup
// run through the real production services and Yjs; no admission verdict is faked.
const transport = vi.hoisted(() => ({
    acquire: undefined as undefined | (() => Promise<unknown>),
    dispose: undefined as undefined | (() => Promise<void>),
}));
vi.mock("../../lib/yjsService.svelte", () => ({ acquireClientByProjectId: () => transport.acquire?.() }));
vi.mock(
    "../../lib/yjs/connection",
    () => ({
        connectTableDoc: async () => ({
            waitForInitialSync: async () => ({ synced: true }),
            dispose: () => transport.dispose?.(),
        }),
    }),
);

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => resolve = done);
    return { promise, resolve };
}
afterAll(resetPgliteForTests, 60000);
afterEach(() => {
    transport.acquire = undefined;
    transport.dispose = undefined;
    globalUndoRouter.clear();
});

function fixture() {
    const source = Project.createInstance("source");
    const destination = Project.createInstance("destination");
    const table = createTable(
        source.ydoc,
        "Contacts",
        "contacts",
        undefined,
        h => h.schemaText.insert(0, "CREATE TABLE contacts (id TEXT PRIMARY KEY)"),
    );
    addRecord(getTableHandles(source.ydoc, table)!, { id: "source" }, "source");
    const grid = createGrid(source.ydoc, undefined, { query: "SELECT * FROM contacts", insertTargetTableId: table });
    const options = {
        sourceProjectId: source.ydoc.guid,
        destinationDoc: destination.ydoc,
        destinationProject: destination,
        snapshots: exportTableStructures(source.ydoc, [table]),
        grids: { [grid]: exportGridSlice(source.ydoc, grid) },
        requestedSourceTableIds: [table],
        isDestinationCurrent: () => true,
    };
    return { source, destination, table, options };
}
function peerDelete(destination: Project, id: string, restore: boolean) {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(destination.ydoc));
    globalUndoRouter.clear();
    expect(removeGridWithPlacements(Project.fromDoc(peer), id)).toBe(true);
    if (restore) {
        globalUndoRouter.undo();
        getGridRegistry(peer).get(id)!.set("name", "Peer replacement");
    }
    Y.applyUpdate(destination.ydoc, Y.encodeStateAsUpdate(peer), "peer");
}

describe("cross-Project Copy final destination admission", { timeout: 60000 }, () => {
    for (const boundary of ["acquisition", "disposal"] as const) {
        it(`refuses a Grid deleted while ${boundary} is held, even with valid structure fallback`, async () => {
            const f = fixture();
            const entered = deferred();
            const release = deferred();
            transport.acquire = boundary === "acquisition"
                ? async () => {
                    entered.resolve();
                    await release.promise;
                    return undefined;
                }
                : async () => ({ client: { project: f.source }, release() {} });
            if (boundary === "disposal") {
                transport.dispose = async () => {
                    entered.resolve();
                    await release.promise;
                };
            }
            const events: GridPasteProgress[] = [];
            const listener = (event: Event) => events.push((event as CustomEvent<GridPasteProgress>).detail);
            window.addEventListener(GRID_PASTE_PROGRESS_EVENT, listener);
            const copying = cloneGridTablesAcrossProjects(f.options);
            await entered.promise;
            const id = [...getGridRegistry(f.destination.ydoc).keys()][0];
            expect(id).toBeTruthy();
            expect(listTables(f.destination.ydoc)).toHaveLength(1);
            peerDelete(f.destination, id, false);
            release.resolve();
            try {
                await expect(copying).rejects.toThrow(/binding changed/);
            } finally {
                window.removeEventListener(GRID_PASTE_PROGRESS_EVENT, listener);
            }
            expect(getGridRegistry(f.destination.ydoc).size).toBe(0);
            expect(listTables(f.destination.ydoc)).toEqual([]);
            expect(
                events.some(event => event.state === "complete-with-data" || event.state === "complete-without-data"),
            ).toBe(false);
            expect(getTableHandles(f.source.ydoc, f.table)!.data.has("source")).toBe(true);
        });
    }
    it("preserves a peer replacement when cancellation follows post-allocation synchronization", async () => {
        const f = fixture();
        const entered = deferred();
        const release = deferred();
        transport.acquire = async () => ({ client: { project: f.source }, release() {} });
        transport.dispose = async () => {
            entered.resolve();
            await release.promise;
        };
        const copying = cloneGridTablesAcrossProjects(f.options);
        await entered.promise;
        const id = [...getGridRegistry(f.destination.ydoc).keys()][0];
        peerDelete(f.destination, id, true);
        const replacement = getGridRegistry(f.destination.ydoc).get(id);
        window.dispatchEvent(new Event(GRID_PASTE_CANCEL_EVENT));
        release.resolve();
        expect(await copying).toBeUndefined();
        expect(getGridRegistry(f.destination.ydoc).get(id)).toBe(replacement);
        expect(replacement?.get("name")).toBe("Peer replacement");
        expect(listTables(f.destination.ydoc)).toEqual([]);
    });
    for (const mutation of ["provenance", "row"] as const) {
        it(`rechecks reused Table binding facts after acquisition without rejecting ${mutation} indiscriminately`, async () => {
            const f = fixture();
            const entered = deferred();
            const release = deferred();
            const reused = createTable(f.destination.ydoc, "Reused", "contacts", {
                sourceProjectId: f.source.ydoc.guid,
                sourceTableId: f.table,
            }, h => h.schemaText.insert(0, "CREATE TABLE contacts (id TEXT PRIMARY KEY)"));
            transport.acquire = async () => {
                entered.resolve();
                await release.promise;
                return undefined;
            };
            const copying = cloneGridTablesAcrossProjects(f.options);
            await entered.promise;
            if (mutation === "provenance") {
                f.destination.ydoc.getMap<Y.Map<unknown>>("yjsTables").get(reused)!.set(
                    "sourceTableId",
                    "peer-binding",
                );
            } else addRecord(getTableHandles(f.destination.ydoc, reused)!, { id: "peer" }, "peer");
            release.resolve();
            if (mutation === "provenance") {
                await expect(copying).rejects.toThrow(/binding changed/);
                expect(getGridRegistry(f.destination.ydoc).size).toBe(0);
            } else {
                const result = await copying;
                expect(result?.reusedTableIdMap[f.table]).toBe(reused);
                result?.admit();
                expect(getTableHandles(f.destination.ydoc, reused)!.data.has("peer")).toBe(true);
            }
            expect(listTables(f.destination.ydoc).map(table => table.tableId)).toEqual([reused]);
        });
    }
    it("accepts delayed data Copy and valid unavailable-source structure fallback", async () => {
        for (const available of [true, false]) {
            const f = fixture();
            const entered = deferred();
            const release = deferred();
            transport.acquire = async () => {
                entered.resolve();
                await release.promise;
                return available ? { client: { project: f.source }, release() {} } : undefined;
            };
            const copying = cloneGridTablesAcrossProjects(f.options);
            await entered.promise;
            release.resolve();
            const result = await copying;
            expect(result).toBeDefined();
            result!.admit();
            const copied = getTableHandles(f.destination.ydoc, result!.tableIdMap[f.table])!;
            expect([...copied.data.keys()]).toEqual(available ? ["source"] : []);
            expect(getGridRegistry(f.destination.ydoc).size).toBe(1);
        }
    });
});
