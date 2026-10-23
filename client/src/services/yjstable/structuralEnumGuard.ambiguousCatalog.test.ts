import { Project } from "$shared/app-schema";
import { readSqlCatalog, restoreSqlCatalogObject } from "$shared/services/sqlCatalog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { KeyEventHandler } from "../../lib/KeyEventHandler";
import { OUTLINER_ITEMS_MIME } from "../clipboard/itemClipboard";
import { registerEditorSurface } from "../editorSurface";
import { duplicateSelectedObjects, getObjects } from "../objectManager/objectManagerController";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridRegistry } from "./gridDocs";
import { duplicateObjects } from "./objectDuplication";
import { exportGridSlice, exportTableStructures, importTableStructures } from "./tableClone";
import { addRecord, createTable, getTableHandles, listTables } from "./tableDocs";

// Control Svelte UI stores and the source transport boundary. The importer,
// scoped compiler, immutable admissions, Yjs documents and history run for real.
const clipboard = vi.hoisted(() => ({
    source: undefined as Y.Doc | undefined,
    destination: undefined as Y.Doc | undefined,
    manager: undefined as Y.UndoManager | undefined,
}));
vi.mock("../../stores/CommandPaletteStore.svelte", () => ({
    commandPaletteStore: { isVisible: false, hide: () => {} },
}));
vi.mock("../../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: { isVisible: false, hide: () => {} },
}));
vi.mock("../../stores/store.svelte", () => ({
    store: {
        get project() {
            return clipboard.destination ? Project.fromDoc(clipboard.destination) : undefined;
        },
        get undoManager() {
            return clipboard.manager;
        },
        activeViewModel: { getVisibleItems: () => [] },
    },
}));
vi.mock("../../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        selections: {},
        getTextareaRef: () => undefined,
        getLocalCursorInstances: () => [],
        getActiveItem: () => "clipboard-anchor",
        clearSelections: () => {},
        startCursorBlink: () => {},
    },
}));
vi.mock("../../lib/yjsService.svelte", () => ({
    getLoadedProjectDocById: (id: string) => clipboard.source?.guid === id ? clipboard.source : undefined,
    acquireClientByProjectId: async () =>
        clipboard.source
            ? { client: { project: Project.fromDoc(clipboard.source) }, release: () => {} }
            : undefined,
}));
vi.mock("../../lib/yjs/connection", () => ({
    connectTableDoc: async () => ({
        waitForInitialSync: async () => ({ synced: true }),
        dispose: async () => {},
    }),
}));

const enumSql = "CREATE TYPE task_state AS ENUM ('Open', 'Closed')";
let stopSurface: (() => void) | undefined;
beforeEach(() => {
    clipboard.source = undefined;
    clipboard.destination = undefined;
    clipboard.manager = undefined;
    globalUndoRouter.clear();
    stopSurface = registerEditorSurface(() => true);
});
afterEach(() => stopSurface?.());

function catalogEntry(doc: Y.Doc, id: string, source = enumSql) {
    restoreSqlCatalogObject(doc, { id, kind: "enum", source });
}

function fixture() {
    const source = Project.createInstance("ambiguous-enum-source");
    const destination = Project.createInstance("ambiguous-enum-destination");
    // The matching declaration sorts first, exposing first-match admission.
    // Its application identity differs between source and destination.
    catalogEntry(source.ydoc, "a-source-required");
    catalogEntry(destination.ydoc, "a-destination-required");
    const table = createTable(source.ydoc, "Tasks", "tasks", undefined, handles => {
        handles.schemaText.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
    });
    addRecord(getTableHandles(source.ydoc, table)!, { id: "one", state: "Open" }, "one");
    const grid = createGrid(source.ydoc, { query: "SELECT id, state FROM tasks" });
    return { source, destination, table, grid };
}

function snapshot(doc: Y.Doc) {
    return {
        project: Y.encodeStateAsUpdate(doc),
        tables: listTables(doc).map(({ tableId }) => {
            const handles = getTableHandles(doc, tableId)!;
            return { tableId, update: Y.encodeStateAsUpdate(handles.doc) };
        }),
    };
}

async function initialTransfer(route: "duplicate" | "import", value: ReturnType<typeof fixture>) {
    const { source, destination, table, grid } = value;
    if (route === "duplicate") {
        return duplicateObjects(source.ydoc, destination.ydoc, { type: "table", id: table }, "item-only", {
            copyTableData: true,
        });
    }
    return importTableStructures(
        destination.ydoc,
        exportTableStructures(source.ydoc, [table]),
        source.ydoc.guid,
        new Set([table]),
        true,
        { [grid]: exportGridSlice(source.ydoc, grid) },
    );
}

describe("required ENUM catalog identity is unambiguous", () => {
    for (const route of ["duplicate", "import"] as const) {
        for (const sameLabels of [false, true]) {
            it(`${route} refuses duplicate required declarations before publication: sameLabels=${sameLabels}`, async () => {
                const value = fixture();
                catalogEntry(
                    value.destination.ydoc,
                    "z-duplicate-required",
                    sameLabels ? enumSql : "CREATE TYPE task_state AS ENUM ('Closed', 'Open')",
                );
                const before = snapshot(value.destination.ydoc);
                const sourceBefore = snapshot(value.source.ydoc);
                const additions: string[] = [];
                const registry = value.destination.ydoc.getMap<Y.Map<unknown>>("yjsTables");
                const observe = (event: Y.YMapEvent<Y.Map<unknown>>) => {
                    for (const [id, change] of event.changes.keys) {
                        if (change.action === "add") additions.push(id);
                    }
                };
                registry.observe(observe);
                try {
                    await expect(initialTransfer(route, value)).rejects.toThrow(/ambiguous|incompatible/i);
                    expect(additions).toEqual([]);
                    expect(snapshot(value.destination.ydoc)).toEqual(before);
                    expect(snapshot(value.source.ydoc)).toEqual(sourceBefore);
                } finally {
                    registry.unobserve(observe);
                }
            });
        }

        it(`${route} ignores duplicate declarations for an unrelated SQL name`, async () => {
            const value = fixture();
            for (const doc of [value.source.ydoc, value.destination.ydoc]) {
                catalogEntry(doc, "other-first", "CREATE TYPE unrelated AS ENUM ('A', 'B')");
                catalogEntry(doc, "other-second", "CREATE TYPE unrelated AS ENUM ('B', 'A')");
            }
            await initialTransfer(route, value);
            expect(listTables(value.destination.ydoc)).toHaveLength(1);
            expect(
                getTableHandles(value.destination.ydoc, listTables(value.destination.ydoc)[0].tableId)
                    ?.schemaText.toString(),
            ).toContain("state task_state");
        });
    }

    for (const changedProject of ["source", "destination"] as const) {
        it(`Object Manager replay refuses a newly ambiguous ${changedProject} required type`, async () => {
            const value = fixture();
            const selected = getObjects(value.source).filter(object => object.id === value.table);
            globalUndoRouter.clear();
            expect(
                await duplicateSelectedObjects(value.source.ydoc, value.destination.ydoc, selected, {
                    copyTableData: true,
                }),
            ).not.toBeNull();
            globalUndoRouter.undo();
            await expect.poll(() => globalUndoRouter.isPending).toBe(false);
            expect(listTables(value.destination.ydoc)).toEqual([]);
            catalogEntry(value[changedProject].ydoc, "z-duplicate-required");
            const before = snapshot(value.destination.ydoc);
            const sourceBefore = snapshot(value.source.ydoc);
            const positions = [globalUndoRouter.undoDepth, globalUndoRouter.redoDepth];
            globalUndoRouter.redo();
            await expect.poll(() => globalUndoRouter.isPending).toBe(false);
            expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
            expect(snapshot(value.destination.ydoc)).toEqual(before);
            expect(snapshot(value.source.ydoc)).toEqual(sourceBefore);
            expect([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]).toEqual(positions);
        });

        it(`clipboard replay refuses a newly ambiguous loaded ${changedProject} required type`, async () => {
            const value = fixture();
            clipboard.source = value.source.ydoc;
            clipboard.destination = value.destination.ydoc;
            document.body.innerHTML = `<div class="outliner"><textarea class="global-textarea"></textarea></div>`;
            (document.querySelector("textarea") as HTMLTextAreaElement).focus();
            const outline = value.destination.ydoc.getMap<string>("clipboard-outline");
            const manager = new Y.UndoManager(outline);
            clipboard.manager = manager;
            globalUndoRouter.register(manager);
            globalUndoRouter.clear();
            const insert = (event: Event) =>
                outline.set("placement", (event as CustomEvent).detail.structuredItems[0].yjsGridId);
            window.addEventListener("paste-multi-item", insert);
            try {
                const catalog = readSqlCatalog(value.source.ydoc.guid, value.source.ydoc);
                if (catalog.status !== "ready") throw new Error("Fixture catalog is unavailable");
                const encoded = JSON.stringify({
                    version: 3,
                    sourceProjectId: value.source.ydoc.guid,
                    items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: value.grid }],
                    tables: exportTableStructures(value.source.ydoc, [value.table]),
                    grids: { [value.grid]: exportGridSlice(value.source.ydoc, value.grid) },
                    catalog: catalog.snapshot,
                });
                await KeyEventHandler.handlePaste({
                    clipboardData: { getData: (format: string) => format === OUTLINER_ITEMS_MIME ? encoded : "" },
                    preventDefault: () => {},
                } as unknown as ClipboardEvent);
                expect(outline.size).toBe(1);
                expect(listTables(value.destination.ydoc)).toHaveLength(1);
                globalUndoRouter.undo();
                expect(outline.size).toBe(0);
                expect(listTables(value.destination.ydoc)).toEqual([]);
                catalogEntry(value[changedProject].ydoc, "z-duplicate-required");
                const before = snapshot(value.destination.ydoc);
                const sourceBefore = snapshot(value.source.ydoc);
                const positions = () => [
                    globalUndoRouter.undoDepth,
                    globalUndoRouter.redoDepth,
                    manager.undoStack.length,
                    manager.redoStack.length,
                ];
                const depths = positions();
                globalUndoRouter.redo();
                expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
                expect(snapshot(value.destination.ydoc)).toEqual(before);
                expect(snapshot(value.source.ydoc)).toEqual(sourceBefore);
                expect(positions()).toEqual(depths);
                expect(outline.size).toBe(0);
                expect(getGridRegistry(value.destination.ydoc).size).toBe(0);
            } finally {
                window.removeEventListener("paste-multi-item", insert);
                globalUndoRouter.unregister(manager);
                manager.destroy();
            }
        });
    }
});
