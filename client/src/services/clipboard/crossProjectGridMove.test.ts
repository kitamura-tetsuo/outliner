import { Project } from "$shared/app-schema";
import { readSqlCatalog } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createCalendar, getCalendar } from "../calendar/calendarService";
import { currentDiagramAuthorization } from "../diagram/diagramClipboard";
import { pendingCutState, stagePendingCut } from "../diagram/diagramClipboardTransfer";
import { registerEditorSurface } from "../editorSurface";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridRegistry } from "../yjstable/gridDocs";
import { appendGridPlacement } from "../yjstable/gridPlacement";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, listTables } from "../yjstable/tableDocs";
import { moveGridPlacementsAcrossProjects } from "./crossProjectGridPaste";
import { GRID_PASTE_WRITE_CHECK_EVENT } from "./gridPasteEvents";
import type { ItemClipboardPayloadV4 } from "./itemClipboard";

let stop: (() => void) | undefined;
afterEach(() => {
    stop?.();
    stop = undefined;
    globalUndoRouter.clear();
});
afterAll(resetPgliteForTests);
function setup(count = 3) {
    stop = registerEditorSurface(() => true);
    globalUndoRouter.clear();
    const source = Project.createInstance("Source");
    const destination = Project.createInstance("Destination");
    const page = source.addPage("Source Page", "author");
    const target = destination.addPage("Target", "author");
    const table = createTable(
        source.ydoc,
        "Tasks",
        "tasks",
        undefined,
        h => h.schemaText.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY)"),
    );
    const grid = createGrid(source.ydoc, {
        query: "SELECT * FROM tasks",
        insertTargetTableId: table,
        confirmRowDelete: true,
    });
    const placements = Array.from({ length: count }, () => appendGridPlacement(source.ydoc, page.id, grid, "author"));
    const selected = placements.slice(0, 2);
    const transferId = stagePendingCut(source, selected.map(item => item.key), true)!;
    const payload: ItemClipboardPayloadV4 = {
        version: 4,
        sourceProjectId: source.ydoc.guid,
        operation: "cut",
        transferId,
        items: selected.map(() => ({ text: "", depth: 0, componentType: "yjstable", yjsGridId: grid })),
    };
    const context = {
        project: destination,
        pageItem: target,
        anchor: undefined,
        author: "author",
        auth: currentDiagramAuthorization(destination),
    };
    return {
        source,
        destination,
        page,
        target,
        table,
        grid,
        placements,
        selected,
        selectedIds: selected.map(item => item.id),
        payload,
        context,
        transferId,
    };
}

describe("cross-Project staged Grid moves", () => {
    it("rechecks pending structural authority inside the real history commit callback", async () => {
        const f = setup(1);
        const realCapture = globalUndoRouter.captureManualAsync.bind(globalUndoRouter);
        let intervened = false;
        vi.spyOn(globalUndoRouter, "captureManualAsync").mockImplementationOnce(async (fn, entry) => {
            // A provider-delivered rebind at the final preparation/commit
            // boundary, after all imports and destination checks completed.
            const peer = new Y.Doc();
            Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.source.ydoc));
            const peerProject = Project.fromDoc(peer);
            const replacement = createGrid(peer, { query: "SELECT 1" });
            (peerProject.tree.getNodeValueFromKey(f.selected[0].key) as Y.Map<unknown>).set("yjsGridId", replacement);
            Y.applyUpdate(f.source.ydoc, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(f.source.ydoc)), "provider");
            intervened = true;
            expect((f.source.tree.getNodeValueFromKey(f.selected[0].key) as Y.Map<unknown>).get("yjsGridId")).toBe(
                replacement,
            );
            return realCapture(fn, entry);
        });
        const depths = [globalUndoRouter.undoDepth, globalUndoRouter.redoDepth];
        const result = await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false);
        expect(intervened).toBe(true);
        expect(result.ok).toBe(false);
        expect(f.page.items.length).toBe(1);
        expect(f.target.items.length).toBe(0);
        expect(getGridRegistry(f.destination.ydoc).size).toBe(0);
        expect(listTables(f.destination.ydoc)).toEqual([]);
        expect([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]).toEqual(depths);
        vi.restoreAllMocks();
    });

    it("preserves mixed Calendar transfer behavior alongside a Grid move", async () => {
        const f = setup(1);
        const calendarId = createCalendar(f.source, {
            name: "Calendar",
            query: "SELECT id AS title FROM tasks",
            roleTitle: "title",
        });
        const calendarPlacement = f.page.items.addNode("author");
        calendarPlacement.componentType = "calendar";
        (f.source.tree.getNodeValueFromKey(calendarPlacement.key) as Y.Map<unknown>).set("calendarId", calendarId);
        const transferId = stagePendingCut(
            f.source,
            [...f.selected.map(item => item.key), calendarPlacement.key],
            true,
        )!;
        f.payload.transferId = transferId;
        globalUndoRouter.stopCapturing();
        const unrelated = createCalendar(f.source, { name: "Unrelated history" });
        globalUndoRouter.undo();
        expect(f.source.calendars.has(unrelated)).toBe(false);
        const before = [globalUndoRouter.undoDepth, globalUndoRouter.redoDepth];
        expect(before[1]).toBeGreaterThan(0);
        const historyDuringPreparation: number[][] = [];
        const result = await moveGridPlacementsAcrossProjects(f.payload, f.context, () => {
            historyDuringPreparation.push([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]);
            return true;
        }, false);
        expect(historyDuringPreparation.length).toBeGreaterThan(0);
        expect(historyDuringPreparation.every(state => JSON.stringify(state) === JSON.stringify(before))).toBe(true);
        expect(result.ok).toBe(true);
        const copiedCalendar = [...f.target.items].find(item => item.componentType === "calendar")!;
        const copiedCalendarId = (f.destination.tree.getNodeValueFromKey(copiedCalendar.key) as Y.Map<unknown>).get(
            "calendarId",
        ) as string;
        expect(copiedCalendarId).not.toBe(calendarId);
        expect(getCalendar(f.destination, copiedCalendarId)?.query).toContain(
            listTables(f.destination.ydoc)[0].sqlName,
        );
        expect(getCalendar(f.source, calendarId)?.name).toBe("Calendar");
        f.source.ydoc.transact(() => f.source.calendars.get(calendarId)!.set("name", "Peer Calendar"), "peer");
        globalUndoRouter.undo();
        await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
        expect((f.source.tree.getNodeValueFromKey(calendarPlacement.key) as Y.Map<unknown>).get("calendarId")).toBe(
            calendarId,
        );
        expect(f.destination.calendars.has(copiedCalendarId)).toBe(false);
        expect(getCalendar(f.source, calendarId)?.name).toBe("Peer Calendar");
        globalUndoRouter.redo();
        await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied");
        expect(f.destination.calendars.has(copiedCalendarId)).toBe(true);
        f.source.ydoc.transact(() => f.source.calendars.delete(calendarId), "peer");
        const depth = globalUndoRouter.undoDepth;
        globalUndoRouter.undo();
        await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
        expect(globalUndoRouter.undoDepth).toBe(depth);
        expect(f.destination.calendars.has(copiedCalendarId)).toBe(true);
        expect(f.page.items.length).toBe(0);
    });

    it("moves two original placements into one independent Grid, retaining a third and source settings", async () => {
        const f = setup();
        const original = getGridRegistry(f.source.ydoc).get(f.grid)!.toJSON();
        expect(f.destination.ydoc.share.has("sqlCatalog")).toBe(false);
        const selectedIds = f.selectedIds;
        const result = await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false);
        expect(result.ok).toBe(true);
        expect(result.ok && result.itemIds).toEqual(selectedIds);
        expect(f.destination.ydoc.share.has("sqlCatalog")).toBe(false);
        expect(readSqlCatalog(f.destination.ydoc.guid, f.destination.ydoc).status).toBe("ready");
        expect(getGridRegistry(f.source.ydoc).get(f.grid)?.toJSON()).toEqual(original);
        expect(f.page.items.length).toBe(1);
        expect(f.target.items.length).toBe(2);
        expect([...f.target.items].map(item => item.yjsGridId)).toEqual([f.grid, f.grid]);
        expect(getGridRegistry(f.destination.ydoc).size).toBe(1);
        const copied = getGridRegistry(f.destination.ydoc).get(f.grid)!;
        expect(copied.get("insertTargetTableId")).toBe(listTables(f.destination.ydoc)[0].tableId);
        expect(copied.has("sourceTableId")).toBe(false);
        expect(listTables(f.source.ydoc).map(table => table.tableId)).toEqual([f.table]);
        expect(pendingCutState(f.transferId)).toBe("consumed");
        copied.set("name", "Destination only");
        expect(getGridRegistry(f.source.ydoc).get(f.grid)?.get("name")).not.toBe("Destination only");
    });

    it("retains the last source Grid and stable IDs through Undo/Redo without overwriting source peer data", async () => {
        const f = setup(1);
        expect((await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false)).ok).toBe(true);
        expect(f.page.items.length).toBe(0);
        const tableId = listTables(f.destination.ydoc)[0].tableId;
        const schema = getTableHandles(f.destination.ydoc, tableId)!.schemaText.toString();
        expect(schema).toContain("CREATE TABLE");
        f.source.ydoc.transact(
            () => getGridRegistry(f.source.ydoc).get(f.grid)!.set("name", "Peer source name"),
            "peer",
        );
        const handles = getTableHandles(f.source.ydoc, f.table)!;
        handles.doc.transact(() => addRecord(handles, { id: "peer" }, "peer"), "peer");
        globalUndoRouter.undo();
        await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied");
        expect([...f.page.items].map(item => item.id)).toEqual(f.selectedIds);
        expect(getGridRegistry(f.source.ydoc).get(f.grid)?.get("name")).toBe("Peer source name");
        expect(getGridRegistry(f.destination.ydoc).size).toBe(0);
        globalUndoRouter.redo();
        await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied");
        expect([...f.target.items].map(item => item.id)).toEqual(f.selectedIds);
        expect(listTables(f.destination.ydoc)[0].tableId).toBe(tableId);
        expect(getTableHandles(f.destination.ydoc, tableId)!.schemaText.toString()).toBe(schema);
        expect(getTableHandles(f.source.ydoc, f.table)?.data.has("peer")).toBe(true);
        expect(pendingCutState(f.transferId)).toBe("consumed");
    });

    for (const kind of ["grid", "placement"]) {
        it(`refuses a destination ${kind} identity anywhere in the Project without consuming Cut`, async () => {
            const f = setup();
            if (kind === "grid") {
                createGrid(f.destination.ydoc, { gridId: f.grid, query: "SELECT 1 AS peer" });
            } else {
                const elsewhere = f.destination.addPage("Elsewhere", "peer");
                const value = new Y.Map<unknown>();
                value.set("id", f.selected[0].id);
                f.destination.tree.createNode(elsewhere.key, "different-key", value as never);
            }
            const before = Y.encodeStateAsUpdate(f.destination.ydoc);
            expect(await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false)).toMatchObject({
                ok: false,
                reason: "identity-collision",
            });
            expect(Y.encodeStateAsUpdate(f.destination.ydoc)).toEqual(before);
            expect(f.page.items.length).toBe(3);
            expect(pendingCutState(f.transferId)).toBe("pending");
            expect(globalUndoRouter.undoDepth).toBe(0);
        });
    }

    it("observes a peer collision during real preparation and refuses before shared mutation", async () => {
        const f = setup();
        let reached = false;
        const intervene = () => {
            if (!reached) {
                reached = true;
                createGrid(f.destination.ydoc, { gridId: f.grid, query: "SELECT 1 AS peer" });
            }
        };
        window.addEventListener(GRID_PASTE_WRITE_CHECK_EVENT, intervene);
        try {
            expect((await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false)).ok).toBe(false);
        } finally {
            window.removeEventListener(GRID_PASTE_WRITE_CHECK_EVENT, intervene);
        }
        expect(reached).toBe(true);
        expect(listTables(f.destination.ydoc)).toEqual([]);
        expect(f.page.items.length).toBe(3);
        expect(pendingCutState(f.transferId)).toBe("pending");
        expect(getGridRegistry(f.destination.ydoc).get(f.grid)?.get("query")).toBe("SELECT 1 AS peer");
        expect(globalUndoRouter.undoDepth).toBe(0);
    });
    it("refuses later moves into an existing Grid and a fresh Cut back to the retained source", async () => {
        const f = setup();
        expect((await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false)).ok).toBe(true);
        const remaining = [...f.page.items][0]!;
        const nextId = stagePendingCut(f.source, [remaining.key], true)!;
        expect(
            await moveGridPlacementsAcrossProjects({ ...f.payload, transferId: nextId }, f.context, () => true, false),
        ).toMatchObject({ ok: false, reason: "identity-collision" });
        expect(pendingCutState(nextId)).toBe("pending");
        const backId = stagePendingCut(f.destination, [[...f.target.items][0]!.key], true)!;
        expect(
            await moveGridPlacementsAcrossProjects(
                { ...f.payload, sourceProjectId: f.destination.ydoc.guid, transferId: backId },
                { ...f.context, project: f.source, pageItem: f.page },
                () => true,
                false,
            ),
        ).toMatchObject({ ok: false, reason: "identity-collision" });
        expect(f.page.items.length).toBe(1);
        expect(f.target.items.length).toBe(2);
        expect(pendingCutState(backId)).toBe("pending");
    });

    it("refuses a source rebind observed during preparation without overwriting the peer binding", async () => {
        const f = setup();
        const peer = createGrid(f.source.ydoc, { query: "SELECT 1 AS peer" });
        let reached = false;
        const intervene = () => {
            if (reached) return;
            reached = true;
            f.source.ydoc.transact(
                () => (f.source.tree.getNodeValueFromKey(f.selected[0]!.key) as Y.Map<unknown>).set("yjsGridId", peer),
                "peer",
            );
        };
        window.addEventListener(GRID_PASTE_WRITE_CHECK_EVENT, intervene);
        try {
            expect((await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false)).ok).toBe(false);
        } finally {
            window.removeEventListener(GRID_PASTE_WRITE_CHECK_EVENT, intervene);
        }
        expect(reached).toBe(true);
        expect(f.selected[0]!.yjsGridId).toBe(peer);
        expect(f.page.items.length).toBe(3);
        expect(f.target.items.length).toBe(0);
        expect(listTables(f.destination.ydoc)).toEqual([]);
        expect(globalUndoRouter.undoDepth).toBe(0);
        expect(pendingCutState(f.transferId)).toBe("invalid");
    });

    it("a conflicting Redo preserves the peer Grid and does not advance history", async () => {
        const f = setup(1);
        expect((await moveGridPlacementsAcrossProjects(f.payload, f.context, () => true, false)).ok).toBe(true);
        globalUndoRouter.undo();
        await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
        const depth = globalUndoRouter.redoDepth;
        f.destination.ydoc.transact(
            () => createGrid(f.destination.ydoc, { gridId: f.grid, query: "SELECT 7 AS peer" }),
            "peer",
        );
        globalUndoRouter.redo();
        await vi.waitFor(() => expect(globalUndoRouter.isPending).toBe(false));
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("conflict");
        expect(globalUndoRouter.redoDepth).toBe(depth);
        expect(f.page.items.length).toBe(1);
        expect(f.target.items.length).toBe(0);
        expect(getGridRegistry(f.destination.ydoc).get(f.grid)?.get("query")).toBe("SELECT 7 AS peer");
    });
});
