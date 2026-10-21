import { Project } from "$shared/app-schema";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createScheduleRule } from "../schedule/scheduleRuleService";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridRegistry, removeGridWithPlacements } from "../yjstable/gridDocs";
import { getPglite, resetPgliteForTests } from "../yjstable/pgliteService";
import { exportGridSlice, exportTableStructures } from "../yjstable/tableClone";
import { addRecord, createTable, getTableHandles, listTables } from "../yjstable/tableDocs";
import { cloneGridTablesAcrossProjects } from "./crossProjectGridPaste";
import { GRID_PASTE_CANCEL_EVENT, GRID_PASTE_PROGRESS_EVENT, type GridPasteProgress } from "./gridPasteEvents";

// Controlled source transport only. Allocation, binding checks, copy and cleanup
// run through the real production services and Yjs; no admission verdict is faked.
const transport = vi.hoisted(() => ({
    loaded: undefined as Y.Doc | undefined,
    acquire: undefined as undefined | (() => Promise<unknown>),
    dispose: undefined as undefined | (() => Promise<void>),
    sync: undefined as undefined | (() => Promise<{ synced: boolean; }>),
}));
vi.mock(
    "../../lib/yjsService.svelte",
    () => ({ acquireClientByProjectId: () => transport.acquire?.(), getLoadedProjectDocById: () => transport.loaded }),
);
vi.mock(
    "../../lib/yjs/connection",
    () => ({
        connectTableDoc: async () => ({
            waitForInitialSync: () => transport.sync?.() ?? Promise.resolve({ synced: true }),
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
    transport.loaded = undefined;
    transport.acquire = undefined;
    vi.restoreAllMocks();
    transport.dispose = undefined;
    transport.sync = undefined;
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
    for (const mutation of ["query", "incarnation", "dependency", "row", "unavailable"] as const) {
        it(`no-data observes loaded identity before the actual SQL await: ${mutation}`, async () => {
            const f = fixture();
            const grid = Object.keys(f.options.grids)[0];
            if (mutation !== "unavailable") transport.loaded = f.source.ydoc;
            const acquire = vi.fn(async () => {
                throw new Error("No-data must not acquire a source");
            });
            transport.acquire = acquire;
            const db = await getPglite();
            const original = db.exec.bind(db);
            const entered = deferred();
            const resume = deferred();
            vi.spyOn(db, "exec").mockImplementation(async (...args: Parameters<typeof db.exec>) => {
                if (String(args[0]).includes("__yjstable_clone_")) {
                    entered.resolve();
                    await resume.promise;
                }
                return original(...args);
            });
            const pending = cloneGridTablesAcrossProjects({ ...f.options, copyData: false, deferCompletion: true });
            await entered.promise;
            if (mutation === "query") getGridRegistry(f.source.ydoc).get(grid)!.set("query", "SELECT id FROM contacts");
            if (mutation === "incarnation") peerDelete(f.source, grid, true);
            if (mutation === "dependency") {
                f.source.ydoc.getMap<Y.Map<unknown>>("yjsTables").get(f.table)!.set("doc", new Y.Doc());
            }
            if (mutation === "row") {
                addRecord(getTableHandles(f.source.ydoc, f.table)!, { id: "peer" }, "peer");
                getGridRegistry(f.source.ydoc).get(grid)!.set("name", "Peer presentation");
            }
            resume.resolve();
            if (mutation === "row" || mutation === "unavailable") {
                const result = await pending;
                expect(result).toBeDefined();
                result!.admit();
                expect(getTableHandles(f.destination.ydoc, result!.tableIdMap[f.table])!.data.size).toBe(0);
                result!.complete();
            } else {
                await expect(pending).rejects.toThrow("changed");
                expect(listTables(f.destination.ydoc)).toEqual([]);
                expect(getGridRegistry(f.destination.ydoc).size).toBe(0);
            }
            expect(acquire).not.toHaveBeenCalled();
        });
    }

    for (const mutation of ["delete", "query", "incarnation", "row"] as const) {
        it(`keeps acquired source authority through held synchronization: ${mutation}`, async () => {
            const f = fixture();
            const grid = Object.keys(f.options.grids)[0];
            const keep = createTable(
                f.destination.ydoc,
                "Keep",
                "keep",
                undefined,
                handles => handles.schemaText.insert(0, "CREATE TABLE keep (id TEXT PRIMARY KEY)"),
            );
            addRecord(getTableHandles(f.destination.ydoc, keep)!, { id: "unrelated" }, "unrelated");
            const keepGrid = createGrid(f.destination.ydoc, undefined, { query: "SELECT * FROM keep" });
            const keepEntry = getGridRegistry(f.destination.ydoc).get(keepGrid);
            const entered = deferred();
            const resume = deferred();
            const released = vi.fn();
            transport.acquire = async () => ({ client: { project: f.source }, release: released });
            transport.sync = async () => {
                entered.resolve();
                await resume.promise;
                return { synced: true };
            };
            const events: GridPasteProgress[] = [];
            const listener = (event: Event) => events.push((event as CustomEvent<GridPasteProgress>).detail);
            window.addEventListener(GRID_PASTE_PROGRESS_EVENT, listener);
            const pending = cloneGridTablesAcrossProjects({ ...f.options, deferCompletion: true });
            await entered.promise;
            expect(getGridRegistry(f.source.ydoc).has(grid)).toBe(true);
            expect(released).not.toHaveBeenCalled();
            if (mutation === "delete" || mutation === "incarnation") {
                peerDelete(f.source, grid, mutation === "incarnation");
            } else if (mutation === "query") {
                getGridRegistry(f.source.ydoc).get(grid)!.set("query", "SELECT id FROM contacts");
            } else {
                getGridRegistry(f.source.ydoc).get(grid)!.set("name", "Peer presentation");
                addRecord(getTableHandles(f.source.ydoc, f.table)!, { id: "peer" }, "peer");
            }
            resume.resolve();
            try {
                if (mutation === "row") {
                    const result = (await pending)!;
                    expect(released).not.toHaveBeenCalled();
                    result.admit();
                    expect(getTableHandles(f.destination.ydoc, result.tableIdMap[f.table])!.data.size).toBe(2);
                    result.complete();
                } else {
                    await expect(pending).rejects.toThrow(/source/i);
                    expect([...getGridRegistry(f.destination.ydoc).keys()]).toEqual([keepGrid]);
                    expect(listTables(f.destination.ydoc).map(table => table.tableId)).toEqual([keep]);
                    expect(events.some(event => event.state.startsWith("complete"))).toBe(false);
                }
                expect(getTableHandles(f.destination.ydoc, keep)!.data.toJSON()).toEqual({
                    unrelated: { id: "unrelated" },
                });
                expect(getGridRegistry(f.destination.ydoc).get(keepGrid)).toBe(keepEntry);
                expect(getTableHandles(f.source.ydoc, f.table)!.data.has("source")).toBe(true);
                expect(released).toHaveBeenCalledTimes(1);
            } finally {
                window.removeEventListener(GRID_PASTE_PROGRESS_EVENT, listener);
            }
        });
    }
    it("does not refresh an already changed live query to authorize the clipboard plan", async () => {
        const f = fixture();
        const released = vi.fn();
        const grid = Object.keys(f.options.grids)[0];
        getGridRegistry(f.source.ydoc).get(grid)!.set("query", "SELECT id FROM contacts");
        transport.acquire = async () => ({ client: { project: f.source }, release: released });
        await expect(cloneGridTablesAcrossProjects(f.options)).rejects.toThrow(/source/i);
        expect(listTables(f.destination.ydoc)).toEqual([]);
        expect(getGridRegistry(f.destination.ydoc).size).toBe(0);
        expect(released).toHaveBeenCalledTimes(1);
    });
    it("does not acquire a source for explicit structure-only Copy", async () => {
        const f = fixture();
        const acquire = vi.fn(async () => undefined);
        transport.acquire = acquire;
        const result = await cloneGridTablesAcrossProjects({ ...f.options, copyData: false });
        expect(result).toBeDefined();
        expect(getTableHandles(f.destination.ydoc, result!.tableIdMap[f.table])!.data.size).toBe(0);
        expect(acquire).not.toHaveBeenCalled();
    });
    it("retains the source lease and evidence until deferred final admission", async () => {
        const f = fixture();
        const released = vi.fn();
        transport.acquire = async () => ({ client: { project: f.source }, release: released });
        const result = (await cloneGridTablesAcrossProjects({ ...f.options, deferCompletion: true }))!;
        expect(released).not.toHaveBeenCalled();
        peerDelete(f.source, Object.keys(f.options.grids)[0], false);
        expect(() => result.admit()).toThrow(/source/i);
        result.discard("stale source");
        expect(listTables(f.destination.ydoc)).toEqual([]);
        expect(getGridRegistry(f.destination.ydoc).size).toBe(0);
        expect(released).toHaveBeenCalledTimes(1);
    });
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
    for (const copyData of [true, false]) {
        it(`maps Schedule reads through reused and fresh identities; copyData=${copyData}`, async () => {
            const source = Project.createInstance("mixed-source");
            const destination = Project.createInstance("mixed-destination");
            const makeTable = (project: Project, name: string) =>
                createTable(
                    project.ydoc,
                    name,
                    name,
                    undefined,
                    h => h.schemaText.insert(0, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, value TEXT)`),
                );
            const a = makeTable(source, "a");
            const b = makeTable(source, "b");
            addRecord(getTableHandles(source.ydoc, a)!, { id: "a-row", value: "source-a" }, "a-row");
            addRecord(getTableHandles(source.ydoc, b)!, { id: "b-row", value: "source-b" }, "b-row");
            const unrelated = [makeTable(destination, "a"), makeTable(destination, "b")];
            unrelated.forEach(id =>
                addRecord(getTableHandles(destination.ydoc, id)!, { id: "other", value: id }, "other")
            );
            const options = {
                sourceProjectId: source.ydoc.guid,
                destinationDoc: destination.ydoc,
                destinationProject: destination,
                isDestinationCurrent: () => true,
            };
            const first = await cloneGridTablesAcrossProjects({
                ...options,
                snapshots: exportTableStructures(source.ydoc, [a]),
                requestedSourceTableIds: [a],
                copyData: false,
            });
            const reused = first!.tableIdMap[a];
            const reusedEntry = destination.ydoc.getMap("yjsTables").get(reused);
            addRecord(getTableHandles(destination.ydoc, reused)!, { id: "peer", value: "keep" }, "peer");
            const sql = "INSERT INTO b (id, value) SELECT a.id AS id, a.value AS value FROM a RETURNING *";
            createScheduleRule(source, {
                name: "Write B",
                targetTableId: b,
                sql,
                rrule: "RRULE:FREQ=DAILY",
                enabled: true,
            });
            createScheduleRule(source, {
                name: "Write A",
                targetTableId: a,
                sql: "INSERT INTO a (id, value) VALUES ('scheduled', 'value') RETURNING *",
                rrule: "RRULE:FREQ=DAILY",
                enabled: true,
            });
            createScheduleRule(destination, {
                name: "Keep",
                targetTableId: unrelated[0],
                sql: "INSERT INTO a (id, value) VALUES ('keep', 'keep') RETURNING *",
                rrule: "RRULE:FREQ=DAILY",
            });
            const rulesBefore = destination.schedules.toJSON();
            const sourceRules = source.schedules.toJSON();
            const sourceRows = [a, b].map(id => getTableHandles(source.ydoc, id)!.data.toJSON());
            const otherRows = unrelated.map(id => getTableHandles(destination.ydoc, id)!.data.toJSON());
            const grid = createGrid(source.ydoc, undefined, {
                query: "SELECT a.id AS id, b.value AS value FROM a JOIN b ON a.id = b.id",
                insertTargetTableId: b,
            });
            transport.acquire = async () => ({ client: { project: source }, release() {} });
            const result = await cloneGridTablesAcrossProjects({
                ...options,
                snapshots: exportTableStructures(source.ydoc, [a, b]),
                grids: { [grid]: exportGridSlice(source.ydoc, grid) },
                requestedSourceTableIds: [a, b],
                copyData,
            });
            expect(result!.reusedTableIdMap).toEqual({ [a]: reused });
            expect(Object.keys(result!.tableIdMap)).toEqual([b]);
            expect(listTables(destination.ydoc)).toHaveLength(4);
            expect(destination.ydoc.getMap("yjsTables").get(reused)).toBe(reusedEntry);
            expect(getGridRegistry(destination.ydoc).get(result!.gridIdMap[grid])!.get("query"))
                .toBe("SELECT a_2.id AS id, b_2.value AS value FROM a_2 JOIN b_2 ON a_2.id = b_2.id");
            const copied = result!.createdRuleIds.map(id => destination.schedules.get(id)!);
            expect(copied).toHaveLength(copyData ? 1 : 0);
            if (copyData) {
                expect(copied[0].get("sql"))
                    .toBe("INSERT INTO b_2 (id, value) SELECT a_2.id AS id, a_2.value AS value FROM a_2 RETURNING *");
                expect(copied[0].get("targetTableId")).toBe(result!.tableIdMap[b]);
                expect(copied[0].get("enabled")).toBe(false);
            }
            expect(getTableHandles(destination.ydoc, reused)!.data.toJSON()).toEqual({
                peer: { id: "peer", value: "keep" },
            });
            expect(getTableHandles(destination.ydoc, result!.tableIdMap[b])!.data.toJSON())
                .toEqual(copyData ? sourceRows[1] : {});
            expect(unrelated.map(id => getTableHandles(destination.ydoc, id)!.data.toJSON())).toEqual(otherRows);
            expect([a, b].map(id => getTableHandles(source.ydoc, id)!.data.toJSON())).toEqual(sourceRows);
            expect(source.schedules.toJSON()).toEqual(sourceRules);
            for (const [id, value] of Object.entries(rulesBefore)) {
                expect(destination.schedules.get(id)!.toJSON()).toEqual(value);
            }
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
