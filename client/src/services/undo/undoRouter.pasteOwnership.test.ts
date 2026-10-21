import { Project } from "$shared/app-schema";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridRegistry, removeGridWithPlacements } from "../yjstable/gridDocs";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { exportGridSlice, exportTableStructures, importTableStructures } from "../yjstable/tableClone";
import { removeTableWithPolicy } from "../yjstable/tableDependencies";
import {
    addRecord,
    createTable,
    getTableHandles,
    getTableRegistry,
    listTables,
    setTableSqlName,
} from "../yjstable/tableDocs";
import { globalUndoRouter, UndoRouter } from "./undoRouter.svelte";

afterAll(resetPgliteForTests, 60000);

function deliver(peer: Y.Doc, destination: Y.Doc) {
    Y.applyUpdate(destination, Y.encodeStateAsUpdate(peer), "peer");
    for (const [id, entry] of getTableRegistry(peer)) {
        const source = entry.get("doc");
        const target = getTableRegistry(destination).get(id)?.get("doc");
        if (source instanceof Y.Doc && target instanceof Y.Doc) {
            Y.applyUpdate(target, Y.encodeStateAsUpdate(source), "peer");
        }
    }
}

async function paste(reuse = false) {
    const source = new Y.Doc();
    const table = createTable(source, "Contacts", "contacts", undefined, h => {
        h.schemaText.insert(0, "CREATE TABLE contacts (id TEXT PRIMARY KEY, name TEXT)");
    });
    const grids = [0, 1].map(i =>
        createGrid(source, undefined, {
            name: `Grid ${i}`,
            query: "SELECT * FROM contacts",
            insertTargetTableId: table,
        })
    );
    const project = Project.createInstance("paste-destination");
    if (reuse) {
        createTable(
            project.ydoc,
            "Reused",
            "contacts",
            { sourceProjectId: source.guid, sourceTableId: table },
            h => h.schemaText.insert(0, "CREATE TABLE contacts (id TEXT PRIMARY KEY, name TEXT)"),
        );
    }
    const imported = await importTableStructures(
        project.ydoc,
        exportTableStructures(source, [table]),
        source.guid,
        undefined,
        true,
        Object.fromEntries(grids.map(id => [id, exportGridSlice(source, id)])),
    );
    // A real outline manager with an applicable Grid + ordinary-text edit.
    // The browser regression covers actual ordered-tree insertion separately.
    const outline = project.ydoc.getMap<unknown>("paste-outline-fixture");
    const manager = new Y.UndoManager(outline);
    const router = new UndoRouter();
    router.register(manager);
    project.ydoc.transact(() => {
        outline.set("grid", imported.gridIdMap[grids[0]]);
        outline.set("text", "ordinary sibling");
    });
    router.captureCrossProjectPaste(manager, project.ydoc, imported.bindings);
    return {
        project,
        imported,
        outline,
        manager,
        router,
        tableId: imported.tableIdMap[table] ?? imported.reusedTableIdMap[table],
        gridIds: Object.values(imported.gridIdMap),
    };
}

function positions(f: Awaited<ReturnType<typeof paste>>) {
    return [f.router.undoDepth, f.router.redoDepth, f.manager.undoStack.length, f.manager.redoStack.length];
}

describe("composite paste ownership and relation replay", { timeout: 60000 }, () => {
    it("refuses the whole Undo before outline or any owned-object effect after peer Grid Delete/Undo", async () => {
        const f = await paste();
        addRecord(getTableHandles(f.project.ydoc, f.tableId)!, { id: "kept", name: "unrelated row" }, "kept");
        const peer = new Y.Doc();
        deliver(f.project.ydoc, peer);
        const peerProject = Project.fromDoc(peer);
        globalUndoRouter.clear();
        expect(removeGridWithPlacements(peerProject, f.gridIds[1])).toBe(true);
        globalUndoRouter.undo();
        getGridRegistry(peer).get(f.gridIds[1])!.set("name", "Peer restored Grid");
        deliver(peer, f.project.ydoc);
        const replacement = getGridRegistry(f.project.ydoc).get(f.gridIds[1]);
        const first = getGridRegistry(f.project.ydoc).get(f.gridIds[0]);
        const before = positions(f);
        const outline = f.outline.toJSON();
        f.router.undo();
        expect(getGridRegistry(f.project.ydoc).get(f.gridIds[1])).toBe(replacement);
        expect(replacement?.get("name")).toBe("Peer restored Grid");
        expect(getGridRegistry(f.project.ydoc).get(f.gridIds[0])).toBe(first);
        expect(getTableHandles(f.project.ydoc, f.tableId)!.data.get("kept")?.get("name")).toBe("unrelated row");
        expect(f.outline.toJSON()).toEqual(outline);
        expect(positions(f)).toEqual(before);
        expect(f.router.lastAsyncOutcome?.status).toBe("refused");
    });

    it("refuses a peer SQL-name claim, then replays the recorded identities and refreshes ownership", async () => {
        const f = await paste();
        f.router.undo();
        const before = positions(f);
        const peer = new Y.Doc();
        deliver(f.project.ydoc, peer);
        const otherId = createTable(peer, "Peer contacts", "contacts", undefined, h => {
            h.schemaText.insert(0, "CREATE TABLE contacts (id TEXT PRIMARY KEY, peer TEXT)");
        });
        addRecord(getTableHandles(peer, otherId)!, { id: "peer", peer: "keep" }, "peer");
        deliver(peer, f.project.ydoc);
        const other = getTableRegistry(f.project.ydoc).get(otherId);
        const otherDoc = getTableHandles(f.project.ydoc, otherId)!;
        const state = otherDoc.data.toJSON();
        f.router.redo();
        expect(listTables(f.project.ydoc).filter(t => t.sqlName === "contacts").map(t => t.tableId)).toEqual([otherId]);
        expect(getTableRegistry(f.project.ydoc).get(otherId)).toBe(other);
        expect(otherDoc.schemaText.toString()).toBe("CREATE TABLE contacts (id TEXT PRIMARY KEY, peer TEXT)");
        expect(otherDoc.data.toJSON()).toEqual(state);
        expect(f.outline.size).toBe(0);
        expect(positions(f)).toEqual(before);
        removeTableWithPolicy(Project.fromDoc(peer), otherId, "keep-references");
        deliver(peer, f.project.ydoc);
        const unrelated = createTable(f.project.ydoc, "Unrelated", "other");
        f.router.redo();
        expect(f.outline.get("text")).toBe("ordinary sibling");
        for (const id of f.gridIds) {
            expect(getGridRegistry(f.project.ydoc).get(id)?.get("query")).toBe("SELECT * FROM contacts");
            expect(getGridRegistry(f.project.ydoc).get(id)?.get("insertTargetTableId")).toBe(f.tableId);
        }
        f.router.undo();
        expect(f.outline.size).toBe(0);
        expect(getTableRegistry(f.project.ydoc).has(f.tableId)).toBe(false);
        expect(getTableRegistry(f.project.ydoc).has(unrelated)).toBe(true);
        expect(f.gridIds.every(id => !getGridRegistry(f.project.ydoc).has(id))).toBe(true);
    });
    it("completes ordinary Paste/Undo/Redo/Undo with fresh ownership and unchanged peer data", async () => {
        const f = await paste();
        const peerId = createTable(f.project.ydoc, "Peer", "peer_records");
        addRecord(getTableHandles(f.project.ydoc, peerId)!, { id: "peer" }, "peer");
        const original = getGridRegistry(f.project.ydoc).get(f.gridIds[0]);
        f.router.undo();
        expect(positions(f)).toEqual([0, 1, 0, 1]);
        f.router.redo();
        expect(getGridRegistry(f.project.ydoc).get(f.gridIds[0])).not.toBe(original);
        expect(positions(f)).toEqual([1, 0, 1, 0]);
        f.router.undo();
        expect(positions(f)).toEqual([0, 1, 0, 1]);
        expect(f.gridIds.every(id => !getGridRegistry(f.project.ydoc).has(id))).toBe(true);
        expect(getTableHandles(f.project.ydoc, peerId)!.data.has("peer")).toBe(true);
    });

    it("refuses changed reused dependencies on Redo and recovers when the original binding is current", async () => {
        const f = await paste(true);
        f.router.undo();
        const before = positions(f);
        setTableSqlName(f.project.ydoc, f.tableId, "peer_contacts");
        addRecord(getTableHandles(f.project.ydoc, f.tableId)!, { id: "peer", name: "kept" }, "peer");
        f.router.redo();
        expect(positions(f)).toEqual(before);
        expect(f.outline.size).toBe(0);
        expect(f.gridIds.every(id => !getGridRegistry(f.project.ydoc).has(id))).toBe(true);
        setTableSqlName(f.project.ydoc, f.tableId, "contacts");
        f.router.redo();
        expect(f.outline.get("text")).toBe("ordinary sibling");
        f.router.undo();
        expect(getTableHandles(f.project.ydoc, f.tableId)!.data.get("peer")?.get("name")).toBe("kept");
        expect(positions(f)).toEqual(before);
    });
});
