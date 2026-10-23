import {
    createSqlCatalogObject,
    readSqlCatalog,
    removeSqlCatalogObject,
    replaceSqlCatalogSource,
} from "$shared/services/sqlCatalog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Item, Project } from "../schema/app-schema";
import { createCalendar, ensureCalendarUndoManager, updateCalendar } from "../services/calendar/calendarService";
import { GRID_EXPORT_ROW_LIMIT } from "../services/clipboard/gridClipboardExport";
import { GRID_PASTE_CANCEL_EVENT, GRID_PASTE_WRITE_CHECK_EVENT } from "../services/clipboard/gridPasteEvents";
import {
    deserializeClipboardItems,
    type GridTableSnapshot,
    OUTLINER_ITEMS_MIME,
} from "../services/clipboard/itemClipboard";
import {
    PASTE_SPECIAL_REQUEST_EVENT,
    pasteSpecialChoices,
    type PasteSpecialRequest,
} from "../services/clipboard/pasteSpecial";
import { registerEditorSurface } from "../services/editorSurface";
import { createScheduleRule } from "../services/schedule/scheduleRuleService";
import { globalUndoRouter } from "../services/undo/undoRouter.svelte";
import { createGrid, getGridRegistry, removeGridWithPlacements } from "../services/yjstable/gridDocs";
import { exportGridSlice, exportTableStructures } from "../services/yjstable/tableClone";
import { addRecord, createTable, getTableHandles, listTables } from "../services/yjstable/tableDocs";
import {
    getTableClipboardSource,
    registerTableClipboardSource,
    resetTableClipboardSources,
    unregisterTableClipboardSource,
} from "../stores/tableClipboardRegistry";
import { KeyEventHandler } from "./KeyEventHandler";

// Svelte store mocks as permitted by AGENTS.md: the copy path reads the
// selection and the visible item list, both of which live in module-level
// stores. Everything else — the table registry, the component binding lookup,
// the clipboard serializer — runs for real against the Y.Doc built below.
vi.mock("../stores/CommandPaletteStore.svelte", () => ({
    commandPaletteStore: { isVisible: false, hide: vi.fn() },
}));

vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: { isVisible: false, hide: vi.fn() },
}));

// Control only the source registry and transport boundary instead of opening a
// WebSocket out of JSDOM. Cases can keep a real source Y.Doc loaded or hold source
// acquisition; SQL analysis, binding validation and history execute unchanged.
const sourceTransport = vi.hoisted(() => ({
    acquire: () => Promise.resolve(undefined) as Promise<unknown>,
    loaded: undefined as Y.Doc | undefined,
}));
vi.mock("./yjsService.svelte", () => ({
    acquireClientByProjectId: () => sourceTransport.acquire(),
    getLoadedProjectDocById: (projectId: string) =>
        sourceTransport.loaded?.guid === projectId ? sourceTransport.loaded : undefined,
}));

// Controlled Table transport; real admission, copying and history remain authoritative.
vi.mock("./yjs/connection", () => ({
    connectTableDoc: async () => ({
        waitForInitialSync: async () => ({ synced: true }),
        dispose: async () => {},
    }),
}));

type TestEndpoint =
    | { kind: "text"; itemId: string; offset: number; }
    | { kind: "node-boundary"; itemId: string; side: "before" | "after"; };

interface TestSelection {
    startItemId: string;
    startOffset: number;
    endItemId: string;
    endOffset: number;
    userId: string;
    /** Set only by the cases that select a block by its own boundaries (#5025). */
    start?: TestEndpoint;
    end?: TestEndpoint;
}

let stopSurface: (() => void) | undefined;
beforeEach(() => {
    stopSurface = registerEditorSurface(() => true);
    sourceTransport.acquire = () => Promise.resolve(undefined);
    sourceTransport.loaded = undefined;
    state.undoManager = undefined;
});
afterEach(() => stopSurface?.());

const state: {
    selection: TestSelection | undefined;
    visible: Array<{ model: { id: string; original: unknown; }; depth: number; }>;
    doc: Y.Doc;
    undoManager?: Y.UndoManager;
    cursors: Array<{
        isActive: boolean;
        insertText: ReturnType<typeof vi.fn>;
        cutSelectedText?: ReturnType<typeof vi.fn>;
    }>;
} = { selection: undefined, visible: [], doc: new Y.Doc(), cursors: [] };

vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        get selections() {
            // The store stores endpoints (#5025); the fixtures below state a text range
            // the way a caller does, and this mirrors what the store's own door makes of it.
            if (!state.selection) return {};
            const { startItemId, startOffset, endItemId, endOffset } = state.selection;
            return {
                local: {
                    ...state.selection,
                    start: state.selection.start ?? { kind: "text", itemId: startItemId, offset: startOffset },
                    end: state.selection.end ?? { kind: "text", itemId: endItemId, offset: endOffset },
                },
            };
        },
        getSelectedText: () => "selected",
        getTextareaRef: () => undefined,
        getLocalCursorInstances: () => state.cursors,
        getActiveItem: () => "active-item",
        clearSelections: vi.fn(),
        startCursorBlink: vi.fn(),
    },
}));

vi.mock("../stores/store.svelte", () => ({
    store: {
        get project() {
            return Project.fromDoc(state.doc);
        },
        get undoManager() {
            return state.undoManager;
        },
        activeViewModel: { getVisibleItems: () => state.visible },
    },
}));

/**
 * Minimal Fluid `Item` stub: `text` plus the node value map that carries the
 * component binding, which is all the clipboard path reads.
 *
 * A Grid or Calendar node owns no outline text (#5015), so the stub reports
 * none for one - exactly as the schema's own `text` getter does.
 */
function fixtureGridId(tableId: string) {
    return `grid:${tableId}`;
}
function makeItem(id: string, text: string, tableId?: string, calendarId?: string) {
    const project = Project.fromDoc(state.doc);
    let page = [...project.items].find(item => item.text === "Fixture Page");
    if (!page) page = project.addPage("Fixture Page", "fixture");
    if (project.tree.computedMap?.has(id)) project.tree.deleteNodeAndDescendants(id);
    const value = new Y.Map<unknown>();
    value.set("id", id);
    value.set("text", new Y.Text(tableId || calendarId ? "" : text));
    if (tableId) {
        if (!getGridRegistry(state.doc).has(fixtureGridId(tableId))) {
            createGrid(state.doc, {
                gridId: fixtureGridId(tableId),
                query: `SELECT * FROM ${listTables(state.doc).find(table => table.tableId === tableId)!.sqlName}`,
            });
        }
        value.set("componentType", "yjstable");
        value.set("yjsGridId", fixtureGridId(tableId));
    } else if (calendarId) {
        value.set("componentType", "calendar");
        value.set("calendarId", calendarId);
    }
    project.tree.createNode(page.key, id, value as never);
    return new Item(state.doc, project.tree, id);
}

function copyEvent(): { event: ClipboardEvent; data: Map<string, string>; } {
    const data = new Map<string, string>();
    const clipboardData = {
        setData: (format: string, value: string) => data.set(format, value),
        getData: (format: string) => data.get(format) ?? "",
    } as unknown as DataTransfer;
    return {
        event: {
            clipboardData,
            preventDefault: vi.fn(),
            isTrusted: false,
            target: undefined,
        } as unknown as ClipboardEvent,
        data,
    };
}

function copiedItems(data: Map<string, string>) {
    return deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME) ?? "")?.items;
}

function createPortableTable(doc: Y.Doc, name = "Sales", sqlName = "sales"): string {
    const tableId = createTable(doc, name, sqlName, undefined, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY)`);
    });
    createGrid(doc, { gridId: fixtureGridId(tableId), query: `SELECT id FROM ${sqlName}` });
    return tableId;
}

function snapshot(sourceTableId: string, sqlName = "sales"): GridTableSnapshot {
    return {
        sourceTableId,
        name: "Sales",
        sqlName,
        schemaSql: `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY)`,
        catalog: {
            projectId: "portable-test-source",
            format: 1,
            revision: "portable-test-empty-catalog",
            objects: [],
        },
    };
}

function gridSnapshot(tableId: string, sqlName = "sales") {
    return {
        gridId: fixtureGridId(tableId),
        name: "Sales",
        query: `SELECT id FROM ${sqlName}`,
        tableIds: [tableId],
        components: {},
        columnOrder: [],
    };
}

function pasteEvent(encoded: string, text: string, vscodeMetadata = ""): ClipboardEvent {
    const values = new Map([
        ["text/plain", text],
        [OUTLINER_ITEMS_MIME, encoded],
        ["application/vscode-editor", vscodeMetadata],
    ]);
    return {
        clipboardData: { getData: (format: string) => values.get(format) ?? "" } as DataTransfer,
        preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
}

async function pasteAndCapture(encoded: string, text: string, vscodeMetadata = "") {
    let detail: Record<string, unknown> | undefined;
    const listener = (event: Event) => {
        detail = (event as CustomEvent<Record<string, unknown>>).detail;
    };
    window.addEventListener("paste-multi-item", listener);
    try {
        await KeyEventHandler.handlePaste(pasteEvent(encoded, text, vscodeMetadata));
        return detail;
    } finally {
        window.removeEventListener("paste-multi-item", listener);
    }
}

function copySingleComponent(source: Y.Doc, tableId?: string, calendarId?: string) {
    const destination = state.doc;
    try {
        state.doc = source;
        const item = makeItem("copied-component", "", tableId, calendarId);
        state.visible = [{ model: { id: item.id, original: item }, depth: 0 }];
        state.selection = {
            startItemId: item.id,
            startOffset: 0,
            endItemId: item.id,
            endOffset: 0,
            userId: "local",
            start: { kind: "node-boundary", itemId: item.id, side: "before" },
            end: { kind: "node-boundary", itemId: item.id, side: "after" },
        };
        const { event, data } = copyEvent();
        KeyEventHandler.handleCopy(event);
        const encoded = data.get(OUTLINER_ITEMS_MIME);
        expect(encoded).toBeTruthy();
        return { encoded: encoded!, text: data.get("text/plain") ?? "" };
    } finally {
        state.doc = destination;
        state.selection = undefined;
        state.visible = [];
    }
}

function captureComponentPasteHistory() {
    const project = Project.fromDoc(state.doc);
    const page = project.addPage("Destination", "fixture");
    const manager = new Y.UndoManager(state.doc.getMap("orderedTree"));
    const calendarManager = ensureCalendarUndoManager(project);
    state.undoManager = manager;
    globalUndoRouter.register(manager);
    globalUndoRouter.clear();
    const positions = () => [
        globalUndoRouter.undoDepth,
        globalUndoRouter.redoDepth,
        manager.undoStack.length,
        manager.redoStack.length,
        calendarManager.undoStack.length,
        calendarManager.redoStack.length,
    ];
    const insert = (event: Event) =>
        project.ydoc.transact(() => {
            const items = (event as CustomEvent<{
                structuredItems: Array<{
                    componentType: string;
                    yjsGridId?: string;
                    calendarId?: string;
                }>;
            }>).detail.structuredItems;
            for (const item of items) {
                const node = page.items.addNode("local");
                const value = project.tree.getNodeValueFromKey(node.key) as Y.Map<unknown>;
                value.set("componentType", item.componentType);
                if (item.yjsGridId) value.set("yjsGridId", item.yjsGridId);
                if (item.calendarId) value.set("calendarId", item.calendarId);
            }
        });
    window.addEventListener("paste-multi-item", insert);
    return {
        project,
        page,
        positions,
        dispose: () => {
            window.removeEventListener("paste-multi-item", insert);
            globalUndoRouter.unregister(manager);
            manager.destroy();
        },
    };
}

describe("KeyEventHandler.handleCopy component bindings", () => {
    let tableId: string;

    beforeEach(() => {
        document.body.innerHTML = `<div class="outliner"><textarea class="global-textarea"></textarea></div>`;
        (document.querySelector("textarea") as HTMLTextAreaElement).focus();
        state.doc = new Y.Doc();
        state.selection = undefined;
        state.cursors = [];
        tableId = createPortableTable(state.doc);
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Intro text") }, depth: 0 },
            { model: { id: "b", original: makeItem("b", "Database tables", tableId) }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "Trailing text") }, depth: 0 },
        ];
    });

    it("keeps the Grid binding when the drag stops inside the edge items", () => {
        // Mouse drags rarely land on item boundaries: start mid-word, end mid-word.
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "text", depth: 0 },
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: fixtureGridId(tableId) },
            { text: "Trailing", depth: 0 },
        ]);
        // Outward, an unrendered block contributes no line at all: its Table
        // name is not a caption the outline owns (#5024).
        expect(data.get("text/plain")).toBe("text\nTrailing");
    });

    it("copies a current Grid binding across partial text endpoints without a Table placement field", () => {
        const gridId = createGrid(state.doc, { query: "SELECT id FROM sales" });
        const value = new Map<string, unknown>([["componentType", "yjstable"], ["yjsGridId", gridId]]);
        state.visible[1].model.original = {
            id: "b",
            key: "b",
            text: "",
            tree: { getNodeValueFromKey: () => value },
        };
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();
        KeyEventHandler.handleCopy(event);
        expect(copiedItems(data)).toEqual([
            { text: "text", depth: 0 },
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: gridId },
            { text: "Trailing", depth: 0 },
        ]);
    });

    it("copies a lone Grid selected between its own boundaries (#5025)", () => {
        // No text endpoint anywhere in the range: the block is the whole selection.
        state.selection = {
            startItemId: "b",
            startOffset: 0,
            endItemId: "b",
            endOffset: 0,
            userId: "local",
            start: { kind: "node-boundary", itemId: "b", side: "before" },
            end: { kind: "node-boundary", itemId: "b", side: "after" },
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: fixtureGridId(tableId) },
        ]);
        // The block owns no outline text, so the plain flavor stays empty (#5015).
        expect(data.get("text/plain") ?? "").toBe("");
    });

    it("leaves a Grid out of the payload when the range starts after it (#5025)", () => {
        // The range reaches from the far side of the block into the next item, so the
        // block itself is outside it - no binding travels.
        state.selection = {
            startItemId: "b",
            startOffset: 0,
            endItemId: "c",
            endOffset: "Trailing text".length,
            userId: "local",
            start: { kind: "node-boundary", itemId: "b", side: "after" },
            end: { kind: "text", itemId: "c", offset: "Trailing text".length },
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([{ text: "Trailing text", depth: 0 }]);
    });

    it("copies from a nested item through a shallower Grid without producing a negative depth", () => {
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Nested explanation") }, depth: 2 },
            { model: { id: "b", original: makeItem("b", "Database tables", tableId) }, depth: 1 },
        ];
        state.selection = {
            startItemId: "a",
            startOffset: 0,
            endItemId: "b",
            endOffset: "Database tables".length,
            userId: "local",
        };
        const { event, data } = copyEvent();

        expect(() => KeyEventHandler.handleCopy(event)).not.toThrow();
        expect(copiedItems(data)).toEqual([
            { text: "Nested explanation", depth: 1 },
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: fixtureGridId(tableId) },
        ]);
    });

    it("carries an unrendered Grid host as a binding, and as no plain text at all", () => {
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        // The private payload keeps the block text-less (#5015)...
        expect(copiedItems(data)?.[1]).toEqual({
            text: "",
            depth: 0,
            componentType: "yjstable",
            yjsGridId: fixtureGridId(tableId),
        });
        // ...and the outward flavor invents no caption for it (#5024).
        expect(data.get("text/plain")).not.toContain("Sales");
    });

    it("copies a mixed Text/Calendar/Text selection as bindings plus the text alone", () => {
        // The rendering counterpart of this selection draws the Calendar as a
        // selected node (#5024); the clipboard carries the binding, and the
        // plain-text flavor stays exactly the selected text.
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Before text") }, depth: 0 },
            { model: { id: "cal", original: makeItem("cal", "", undefined, "calendar-1") }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "After text") }, depth: 0 },
        ];
        state.selection = { startItemId: "a", startOffset: 7, endItemId: "c", endOffset: 5, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "text", depth: 0 },
            { text: "", depth: 0, componentType: "calendar", calendarId: "calendar-1" },
            { text: "After", depth: 0 },
        ]);
        expect(data.get("text/plain")).toBe("text\nAfter");
    });

    it("never writes Grid row data to any clipboard MIME type", () => {
        const secret = "row-data-must-stay-out-of-the-clipboard";
        const table = state.doc.getMap<Y.Map<unknown>>("yjsTables").get(tableId)!;
        const subdoc = table.get("doc") as Y.Doc;
        const record = new Y.Map<unknown>();
        record.set("value", secret);
        subdoc.getMap<Y.Map<unknown>>("data").set("row-1", record);
        state.selection = { startItemId: "a", startOffset: 0, endItemId: "c", endOffset: 13, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect([...data.values()].every(value => !value.includes(secret))).toBe(true);
    });

    it("drops edge items the selection does not actually reach", () => {
        state.selection = {
            startItemId: "a",
            startOffset: "Intro text".length,
            endItemId: "c",
            endOffset: 0,
            userId: "local",
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: fixtureGridId(tableId) },
        ]);
        // Nothing textual is left to copy, and the block gets no caption to
        // stand in for it (#5024) - the binding alone is the copy.
        expect(data.get("text/plain")).toBe("");
    });

    it("stages a lone block Cut without eager source removal even with no plain text", () => {
        const cutSelectedText = vi.fn();
        state.cursors = [{ isActive: true, insertText: vi.fn(), cutSelectedText }];
        state.selection = {
            startItemId: "a",
            startOffset: "Intro text".length,
            endItemId: "c",
            endOffset: 0,
            userId: "local",
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCut(event);

        // Cut keeps the source placement until admitted Paste moves it.
        expect(copiedItems(data)?.[0].componentType).toBe("yjstable");
        expect(data.get("text/plain")).toBe("");
        expect(cutSelectedText).not.toHaveBeenCalled();
        expect((state.visible[1].model.original as Item).yjsGridId).toBe(fixtureGridId(tableId));
    });

    it("copies a Grid the drag ends on: a text-less block has no interior to stop short of", () => {
        // A visual node owns no outline text (#5015), so an endpoint offset of
        // 0 on one is where the whole block is, not a point before its content.
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Intro text") }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "Trailing text") }, depth: 0 },
            { model: { id: "b", original: makeItem("b", "Database tables", tableId) }, depth: 0 },
        ];
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "b", endOffset: 0, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "text", depth: 0 },
            { text: "Trailing text", depth: 0 },
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: fixtureGridId(tableId) },
        ]);
    });

    it("leaves plain multi-item drags on the plain text path", () => {
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Intro text") }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "Trailing text") }, depth: 0 },
        ];
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(data.get(OUTLINER_ITEMS_MIME)).toBeUndefined();
        expect(data.get("text/plain")).toBe("selected");
    });

    it("still serializes a fully covered selection without components", () => {
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Intro text") }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "Trailing text") }, depth: 1 },
        ];
        state.selection = {
            startItemId: "a",
            startOffset: 0,
            endItemId: "c",
            endOffset: "Trailing text".length,
            userId: "local",
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "Intro text", depth: 0 },
            { text: "Trailing text", depth: 1 },
        ]);
    });

    it("refuses CTE/physical-name collisions before automatic Copy effects", () => {
        createTable(state.doc, "Physical X", "x");
        const grid = state.doc.getMap<Y.Map<unknown>>("yjsGrids").get(fixtureGridId(tableId))!;
        grid.set("query", "WITH x AS (SELECT 1 AS n) SELECT * FROM x");
        state.selection = {
            startItemId: "a",
            startOffset: 0,
            endItemId: "c",
            endOffset: "Trailing text".length,
            userId: "local",
        };
        const baseline = state.doc.toJSON();
        const { event, data } = copyEvent();
        data.set("text/plain", "existing clipboard");
        KeyEventHandler.handleCopy(event);
        expect(data.get("text/plain")).toBe("existing clipboard");
        expect(data.has(OUTLINER_ITEMS_MIME)).toBe(false);
        expect(state.doc.toJSON()).toEqual(baseline);
    });

    it("refuses the entire automatic capture if a selected dependency cannot be exported", () => {
        const invalidTableId = createTable(state.doc, "Invalid", "invalid");
        state.visible = [
            { model: { id: "a", original: makeItem("a", "First", tableId) }, depth: 0 },
            // Depth 0 as well: a Grid is a leaf and cannot hold another (#5015).
            { model: { id: "b", original: makeItem("b", "Second", tableId) }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "Invalid", invalidTableId) }, depth: 0 },
        ];
        state.selection = {
            startItemId: "a",
            startOffset: 0,
            endItemId: "c",
            endOffset: "Invalid".length,
            userId: "local",
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(data.has(OUTLINER_ITEMS_MIME)).toBe(false);
        expect(data.has("text/plain")).toBe(false);
    });

    it("refuses a mixed Calendar/Grid capture when Grid dependency structure is unavailable", () => {
        const invalidTableId = createTable(state.doc, "Invalid", "invalid");
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Calendar", undefined, "calendar-1") }, depth: 0 },
            { model: { id: "b", original: makeItem("b", "Invalid", invalidTableId) }, depth: 0 },
        ];
        state.selection = {
            startItemId: "a",
            startOffset: 0,
            endItemId: "b",
            endOffset: "Invalid".length,
            userId: "local",
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(data.has(OUTLINER_ITEMS_MIME)).toBe(false);
    });

    it("carries a Layout's hidden children with their spans (#4997)", () => {
        // A Layout renders its own children, so they are never visible rows and
        // a copy driven by the visible list would otherwise lose the whole
        // branch. Real schema objects here: the traversal walks the tree.
        const project = Project.fromDoc(state.doc);
        const page = project.addPage("Layout page", "tester");
        const intro = page.items.addNode("tester");
        intro.updateText("Intro");
        const layout = page.items.addNode("tester");
        layout.componentType = "layout";
        const first = layout.items.addNode("tester");
        first.componentType = "yjstable";
        first.yjsGridId = fixtureGridId(tableId);
        first.columnSpan = 4;
        const second = layout.items.addNode("tester");
        second.componentType = "yjstable";
        second.yjsGridId = fixtureGridId(tableId);
        second.columnSpan = 8;
        const outro = page.items.addNode("tester");
        outro.updateText("Outro");

        state.visible = [
            { model: { id: intro.id, original: intro }, depth: 0 },
            { model: { id: layout.id, original: layout }, depth: 0 },
            { model: { id: outro.id, original: outro }, depth: 0 },
        ];
        state.selection = {
            startItemId: intro.id,
            startOffset: 0,
            endItemId: outro.id,
            endOffset: "Outro".length,
            userId: "local",
        };

        const { event, data } = copyEvent();
        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "Intro", depth: 0 },
            { text: "", depth: 0, componentType: "layout" },
            { text: "", depth: 1, componentType: "yjstable", yjsGridId: fixtureGridId(tableId), columnSpan: 4 },
            { text: "", depth: 1, componentType: "yjstable", yjsGridId: fixtureGridId(tableId), columnSpan: 8 },
            { text: "Outro", depth: 0 },
        ]);
    });
});

describe("KeyEventHandler.handleCopy outward Grid flavors", () => {
    let tableId: string;

    const gridConfig = () => ({
        columns: ["month", "revenue", "internal_id"],
        hiddenColumns: { internal_id: true },
        labels: { revenue: "Revenue (¥)" },
        rows: [
            { month: "Jan", revenue: 100, internal_id: "x1" },
            { month: "Feb", revenue: null, internal_id: "x2" },
        ],
    });

    function selectWholeGridHost() {
        state.selection = { startItemId: "a", startOffset: 0, endItemId: "b", endOffset: 0, userId: "local" };
    }

    beforeEach(() => {
        document.body.innerHTML = `<div class="outliner"><textarea class="global-textarea"></textarea></div>`;
        (document.querySelector("textarea") as HTMLTextAreaElement).focus();
        state.doc = new Y.Doc();
        state.selection = undefined;
        state.cursors = [];
        resetTableClipboardSources();
        tableId = createPortableTable(state.doc);
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Intro text") }, depth: 0 },
            { model: { id: "b", original: makeItem("b", "", tableId) }, depth: 0 },
        ];
    });

    it("copies a rendered Grid as TSV and a real HTML table, applying the view's columns", () => {
        registerTableClipboardSource(fixtureGridId(tableId), { getGrid: gridConfig, getChartImage: () => undefined });
        selectWholeGridHost();
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        // The hidden column is gone, the label replaces the SQL name, and NULL
        // is an empty cell.
        expect(data.get("text/plain")).toBe("Intro text\nmonth\tRevenue (¥)\nJan\t100\nFeb\t");
        const html = data.get("text/html") ?? "";
        expect(html).toContain("<th>Revenue (¥)</th>");
        expect(html).toContain("<td>Jan</td>");
        expect(html).not.toContain("internal_id");
        expect(html).toContain("Intro text<br><table>");
    });

    it("keeps the private payload binding the Grid without giving it outline text", () => {
        registerTableClipboardSource(fixtureGridId(tableId), { getGrid: gridConfig, getChartImage: () => undefined });
        selectWholeGridHost();
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "Intro text", depth: 0 },
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: fixtureGridId(tableId) },
        ]);
    });

    it("contributes no plain text when no view has rendered the Grid", () => {
        selectWholeGridHost();
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        // Only what the outline itself owns travels outward: with nothing
        // rendered to export, the block leaves no line rather than an invented
        // caption (#5024). The private payload still carries its binding.
        expect(data.get("text/plain")).toBe("Intro text");
        expect(copiedItems(data)?.[1].componentType).toBe("yjstable");
    });

    it("adds the chart image to the HTML flavor when the chart view is open", () => {
        registerTableClipboardSource(fixtureGridId(tableId), {
            getGrid: gridConfig,
            getChartImage: () => "data:image/png;base64,AAAA",
        });
        selectWholeGridHost();
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(data.get("text/html")).toContain('</table><br><img src="data:image/png;base64,AAAA">');
        // The numbers still travel for spreadsheets.
        expect(data.get("text/plain")).toContain("Jan\t100");
    });

    it("offers the chart as an image/png flavor of the system clipboard write", async () => {
        registerTableClipboardSource(fixtureGridId(tableId), {
            getGrid: gridConfig,
            getChartImage: () => "data:image/png;base64,AAAA",
        });
        const written: Array<Record<string, Blob>> = [];
        // Stub the two clipboard globals jsdom does not provide, so the flavor
        // set of the real write is observable.
        vi.stubGlobal(
            "ClipboardItem",
            class {
                constructor(public readonly items: Record<string, Blob>) {
                    written.push(items);
                }
            },
        );
        vi.stubGlobal("navigator", { clipboard: { write: vi.fn(async () => {}) } });
        try {
            selectWholeGridHost();
            KeyEventHandler.handleCopy(copyEvent().event);
        } finally {
            vi.unstubAllGlobals();
        }

        expect(written).toHaveLength(1);
        expect(Object.keys(written[0])).toEqual(["text/plain", "text/html", "image/png"]);
        expect(written[0]["image/png"].type).toBe("image/png");
    });

    it("drops an oversized chart image and marks the export truncated", () => {
        const oversized = "data:image/png;base64," + "A".repeat(2_000_001);
        registerTableClipboardSource(fixtureGridId(tableId), { getGrid: gridConfig, getChartImage: () => oversized });
        selectWholeGridHost();
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(data.get("text/html")).not.toContain("<img");
        expect(data.get("text/html")).toContain("<table>");
        // Never silent: the copy says the picture did not come along.
        expect(data.get("text/html")).toContain("--- Chart image too large to copy ---");
    });

    it("caps the exported rows and says so in the copied content", () => {
        const rows = Array.from({ length: GRID_EXPORT_ROW_LIMIT + 5 }, (_, index) => ({ month: `m${index}` }));
        registerTableClipboardSource(fixtureGridId(tableId), {
            getGrid: () => ({ columns: ["month"], hiddenColumns: {}, labels: {}, rows }),
            getChartImage: () => undefined,
        });
        selectWholeGridHost();
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        const plainText = data.get("text/plain") ?? "";
        expect(plainText).toContain(
            `--- Copy limit reached: first ${GRID_EXPORT_ROW_LIMIT} of ${rows.length} rows ---`,
        );
        expect(plainText).not.toContain(`m${GRID_EXPORT_ROW_LIMIT}\n`);
    });

    it("unregisters only its own source, so a replacing view keeps the registration", () => {
        const first = { getGrid: gridConfig, getChartImage: () => undefined };
        const second = { getGrid: gridConfig, getChartImage: () => undefined };
        registerTableClipboardSource(fixtureGridId(tableId), first);
        registerTableClipboardSource(fixtureGridId(tableId), second);
        unregisterTableClipboardSource(fixtureGridId(tableId), first);

        expect(getTableClipboardSource(fixtureGridId(tableId))).toBe(second);
    });
});

describe("KeyEventHandler.handlePaste portable component bindings", () => {
    beforeEach(() => {
        document.body.innerHTML = `<div class="outliner"><textarea class="global-textarea"></textarea></div>`;
        (document.querySelector("textarea") as HTMLTextAreaElement).focus();
        state.doc = new Y.Doc();
        state.selection = undefined;
        state.visible = [];
        state.cursors = [];
    });

    for (const mutation of ["query", "preference", "dependency", "presentation"] as const) {
        it(`shared placement keeps an isolated non-owned replay witness: ${mutation}`, async () => {
            const doc = state.doc;
            const table = createPortableTable(doc);
            const handles = getTableHandles(doc, table)!;
            addRecord(handles, { id: "saved", value: "source" }, "saved");
            const grid = createGrid(doc, { query: "SELECT * FROM sales", insertTargetTableId: table });
            const entry = getGridRegistry(doc).get(grid)!;
            const outline = doc.getMap("clipboard-outline");
            const manager = new Y.UndoManager(outline);
            state.undoManager = manager;
            globalUndoRouter.clear();
            globalUndoRouter.register(manager);
            const listener = () => outline.set("placement", grid);
            window.addEventListener("paste-multi-item", listener);
            try {
                outline.set("precedingText", "keep this edit");
                await KeyEventHandler.handlePaste(pasteEvent(
                    JSON.stringify({
                        version: 3,
                        sourceProjectId: doc.guid,
                        tables: exportTableStructures(doc, [table]),
                        grids: { [grid]: exportGridSlice(doc, grid) },
                        items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: grid }],
                    }),
                    "Grid",
                ));
                expect(manager.undoStack).toHaveLength(2);
                outline.set("followingText", "separate edit");
                expect(manager.undoStack).toHaveLength(3);
                globalUndoRouter.undo();
                expect(outline.toJSON()).toEqual({ precedingText: "keep this edit", placement: grid });
                globalUndoRouter.undo();
                expect(outline.toJSON()).toEqual({ precedingText: "keep this edit" });
                expect(getGridRegistry(doc).get(grid)).toBe(entry);
                expect(handles.data.toJSON()).toEqual({ saved: { id: "saved", value: "source" } });
                doc.transact(() => {
                    if (mutation === "query") entry.set("query", "SELECT id FROM sales");
                    if (mutation === "preference") entry.delete("insertTargetTableId");
                    if (mutation === "dependency") {
                        doc.getMap<Y.Map<unknown>>("yjsTables").get(table)!.set("doc", new Y.Doc());
                    }
                    if (mutation === "presentation") entry.set("name", "Peer name");
                }, "peer");
                const positions = [
                    globalUndoRouter.undoDepth,
                    globalUndoRouter.redoDepth,
                    manager.undoStack.length,
                    manager.redoStack.length,
                ];
                globalUndoRouter.redo();
                if (mutation === "presentation") expect(outline.get("placement")).toBe(grid);
                else {
                    expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
                    expect(outline.toJSON()).toEqual({ precedingText: "keep this edit" });
                    expect([
                        globalUndoRouter.undoDepth,
                        globalUndoRouter.redoDepth,
                        manager.undoStack.length,
                        manager.redoStack.length,
                    ]).toEqual(positions);
                }
                expect(getGridRegistry(doc).get(grid)).toBe(entry);
            } finally {
                window.removeEventListener("paste-multi-item", listener);
                globalUndoRouter.unregister(manager);
                manager.destroy();
            }
        });
    }

    it("fresh data Copy replays retained exact state after the owned source lease is released", async () => {
        const source = Project.createInstance("leased-source");
        const table = createPortableTable(source.ydoc);
        const handles = getTableHandles(source.ydoc, table)!;
        addRecord(handles, { id: "saved", value: "original" }, "saved");
        const grid = createGrid(source.ydoc, { query: "SELECT * FROM sales", insertTargetTableId: table });
        const released = vi.fn();
        sourceTransport.acquire = async () => ({ client: { project: source }, release: released });
        const destination = state.doc;
        const outline = destination.getMap("clipboard-outline");
        const manager = new Y.UndoManager(outline);
        state.undoManager = manager;
        globalUndoRouter.clear();
        globalUndoRouter.register(manager);
        const listener = (event: Event) =>
            outline.set("placement", (event as CustomEvent).detail.structuredItems[0].yjsGridId);
        window.addEventListener("paste-multi-item", listener);
        try {
            await KeyEventHandler.handlePaste(pasteEvent(
                JSON.stringify({
                    version: 3,
                    sourceProjectId: source.ydoc.guid,
                    tables: exportTableStructures(source.ydoc, [table]),
                    grids: { [grid]: exportGridSlice(source.ydoc, grid) },
                    items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: grid }],
                }),
                "Grid",
            ));
            expect(released).toHaveBeenCalledTimes(1);
            const copied = listTables(destination)[0].tableId;
            const copiedGrid = [...getGridRegistry(destination).keys()][0];
            const before = {
                table: getTableHandles(destination, copied)!.data.toJSON(),
                grid: getGridRegistry(destination).get(copiedGrid)!.toJSON(),
            };
            expect(before.table).toEqual({ saved: { id: "saved", value: "original" } });
            handles.doc.transact(() => addRecord(handles, { id: "later", value: "must not recopy" }, "later"), "peer");
            source.ydoc.transact(
                () => getGridRegistry(source.ydoc).get(grid)!.set("query", "SELECT id FROM sales"),
                "peer",
            );
            globalUndoRouter.undo();
            expect(listTables(destination)).toEqual([]);
            globalUndoRouter.redo();
            expect(listTables(destination).map(t => t.tableId)).toEqual([copied]);
            expect(outline.toJSON()).toEqual({ placement: copiedGrid });
            expect(getTableHandles(destination, copied)!.data.toJSON()).toEqual(before.table);
            expect(getGridRegistry(destination).get(copiedGrid)!.toJSON()).toEqual(before.grid);
            expect(released).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener("paste-multi-item", listener);
            globalUndoRouter.unregister(manager);
            manager.destroy();
        }
    });
    for (const sqlKind of ["plain", "enum-cast", "enum-name-literal"] as const) {
        it(`zero-Table fresh Grid replay retains top-level catalog evidence: ${sqlKind}`, async () => {
            const requiredEnum = sqlKind === "enum-cast";
            const source = new Y.Doc({ guid: "query-only-source" });
            if (sqlKind !== "plain") {
                createSqlCatalogObject(source, "enum", "CREATE TYPE TASK_STATE AS ENUM (E'Open', 'Closed')");
            }
            const catalog = readSqlCatalog(source.guid, source);
            if (catalog.status !== "ready") throw new Error("catalog unavailable");
            const destination = state.doc;
            const enumId = requiredEnum
                ? createSqlCatalogObject(destination, "enum", "CREATE TYPE task_state AS ENUM ('Open', 'Closed')")
                : undefined;
            const outline = destination.getMap("clipboard-outline");
            const manager = new Y.UndoManager(outline);
            state.undoManager = manager;
            globalUndoRouter.clear();
            globalUndoRouter.register(manager);
            const listener = (event: Event) =>
                outline.set("placement", (event as CustomEvent).detail.structuredItems[0].yjsGridId);
            window.addEventListener("paste-multi-item", listener);
            try {
                const query = requiredEnum
                    ? "SELECT 'Open'::task_state AS value"
                    : sqlKind === "enum-name-literal"
                    ? "SELECT 'task_state' AS value"
                    : "SELECT 1 AS value";
                await KeyEventHandler.handlePaste(pasteEvent(
                    JSON.stringify({
                        version: 3,
                        sourceProjectId: source.guid,
                        tables: {},
                        catalog: catalog.snapshot,
                        grids: {
                            query: {
                                gridId: "query",
                                name: "Query",
                                query,
                                components: {},
                                columnOrder: [],
                                tableIds: [],
                            },
                        },
                        items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "query" }],
                    }),
                    "Query",
                ));
                const id = [...getGridRegistry(destination).keys()][0];
                expect(id).toBeTruthy();
                const saved = getGridRegistry(destination).get(id)!.toJSON();
                globalUndoRouter.undo();
                expect(getGridRegistry(destination).size).toBe(0);
                globalUndoRouter.redo();
                expect(outline.toJSON()).toEqual({ placement: id });
                expect(getGridRegistry(destination).get(id)!.toJSON()).toEqual(saved);
                if (enumId) {
                    globalUndoRouter.undo();
                    replaceSqlCatalogSource(destination, enumId, "CREATE TYPE task_state AS ENUM ('Closed', 'Open')");
                    const positions = [
                        globalUndoRouter.undoDepth,
                        globalUndoRouter.redoDepth,
                        manager.undoStack.length,
                        manager.redoStack.length,
                    ];
                    globalUndoRouter.redo();
                    expect(getGridRegistry(destination).size).toBe(0);
                    expect(outline.size).toBe(0);
                    expect([
                        globalUndoRouter.undoDepth,
                        globalUndoRouter.redoDepth,
                        manager.undoStack.length,
                        manager.redoStack.length,
                    ]).toEqual(positions);
                    expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
                    removeSqlCatalogObject(destination, enumId);
                    globalUndoRouter.redo();
                    expect(getGridRegistry(destination).size).toBe(0);
                    expect(outline.size).toBe(0);
                    expect([
                        globalUndoRouter.undoDepth,
                        globalUndoRouter.redoDepth,
                        manager.undoStack.length,
                        manager.redoStack.length,
                    ]).toEqual(positions);
                    expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
                }
            } finally {
                window.removeEventListener("paste-multi-item", listener);
                globalUndoRouter.unregister(manager);
                manager.destroy();
            }
        });
    }
    for (const deleted of [false, true]) {
        it(`all-reused Paste replay ${deleted ? "refuses a peer Grid deletion" : "survives unloaded source and peer row edits"}`, async () => {
            const destination = state.doc;
            const outline = destination.getMap<string>("clipboard-outline");
            const manager = new Y.UndoManager(outline);
            state.undoManager = manager;
            globalUndoRouter.clear();
            globalUndoRouter.register(manager);
            const encoded = JSON.stringify({
                version: 3,
                sourceProjectId: "unloaded-source",
                items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }],
                tables: { "source-table": snapshot("source-table") },
                grids: { "grid:source-table": gridSnapshot("source-table") },
            });
            let count = 0;
            const insert = (event: Event) => {
                const items = (event as CustomEvent).detail.structuredItems;
                outline.set(`placement-${++count}`, items[0].yjsGridId);
            };
            const positions = () => [
                globalUndoRouter.undoDepth,
                globalUndoRouter.redoDepth,
                manager.undoStack.length,
                manager.redoStack.length,
            ];
            window.addEventListener("paste-multi-item", insert);
            try {
                await KeyEventHandler.handlePaste(pasteEvent(encoded, "Grid"));
                const table = listTables(destination)[0].tableId;
                const grid = [...getGridRegistry(destination).keys()][0];
                const entry = getGridRegistry(destination).get(grid);
                await KeyEventHandler.handlePaste(pasteEvent(encoded, "Grid"));
                expect(listTables(destination).map(t => t.tableId)).toEqual([table]);
                expect([...getGridRegistry(destination).keys()]).toEqual([grid]);
                expect(outline.toJSON()).toEqual({ "placement-1": grid, "placement-2": grid });
                globalUndoRouter.undo();
                expect(outline.toJSON()).toEqual({ "placement-1": grid });
                expect(getGridRegistry(destination).get(grid)).toBe(entry);
                const handles = getTableHandles(destination, table)!;
                handles.doc.transact(() => addRecord(handles, { id: "peer", value: "kept" }, "peer"), "peer");
                if (deleted) {
                    const peer = new Y.Doc();
                    Y.applyUpdate(peer, Y.encodeStateAsUpdate(destination));
                    // Delivery of a peer deletion; the browser case exercises Object Manager.
                    getGridRegistry(peer).delete(grid);
                    Y.applyUpdate(destination, Y.encodeStateAsUpdate(peer), "peer");
                }
                const before = positions();
                globalUndoRouter.redo();
                if (deleted) {
                    expect(outline.toJSON()).toEqual({ "placement-1": grid });
                    expect(getGridRegistry(destination).has(grid)).toBe(false);
                    expect(positions()).toEqual(before);
                    expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
                } else {
                    expect(outline.toJSON()).toEqual({ "placement-1": grid, "placement-2": grid });
                    expect(getGridRegistry(destination).get(grid)).toBe(entry);
                    expect(positions()).toEqual([2, 0, 2, 0]);
                }
                expect(getTableHandles(destination, table)!.data.get("peer")?.get("value")).toBe("kept");
                if (!deleted) {
                    globalUndoRouter.undo();
                    globalUndoRouter.undo();
                    expect(positions()).toEqual([0, 2, 0, 2]);
                    expect(listTables(destination)).toEqual([]);
                    globalUndoRouter.redo();
                    expect(listTables(destination).map(t => t.tableId)).toEqual([table]);
                    expect([...getGridRegistry(destination).keys()]).toEqual([grid]);
                    expect(outline.toJSON()).toEqual({ "placement-1": grid });
                    expect(positions()).toEqual([1, 1, 1, 1]);
                }
            } finally {
                window.removeEventListener("paste-multi-item", insert);
                globalUndoRouter.unregister(manager);
                manager.destroy();
            }
        });
    }

    for (const change of ["deleted-before", "deleted-during", "query-during"] as const) {
        for (const variant of ["values-only", "another-view"] as const) {
            it(`Paste Special ${variant} after ${change} uses the appropriate captured authority`, async () => {
                const id = createGrid(state.doc, { query: "SELECT 1 AS value" });
                const encoded = JSON.stringify({
                    version: 3,
                    sourceProjectId: state.doc.guid,
                    items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: id }],
                    tables: {},
                });
                const outward = "Name\tValue\nAda\t7";
                if (change === "deleted-before") getGridRegistry(state.doc).delete(id);
                let requested = false;
                const choose = (event: Event) => {
                    requested = true;
                    if (change === "deleted-during") getGridRegistry(state.doc).delete(id);
                    if (change === "query-during") {
                        getGridRegistry(state.doc).get(id)!.set("query", "SELECT 2 AS value");
                    }
                    (event as CustomEvent<PasteSpecialRequest>).detail.resolve(variant);
                };
                window.addEventListener(PASTE_SPECIAL_REQUEST_EVENT, choose);
                KeyEventHandler.handleKeyDown(
                    new KeyboardEvent("keydown", { key: "v", ctrlKey: true, shiftKey: true }),
                );
                let detail: Record<string, unknown> | undefined;
                try {
                    detail = await pasteAndCapture(encoded, outward);
                } finally {
                    window.removeEventListener(PASTE_SPECIAL_REQUEST_EVENT, choose);
                }
                expect(requested).toBe(true);
                if (variant === "values-only") {
                    expect(detail?.lines).toEqual(["Name\tValue", "Ada\t7"]);
                    expect(detail?.structuredItems).toBeUndefined();
                } else expect(detail).toBeUndefined();
                expect(listTables(state.doc)).toEqual([]);
                if (change !== "query-during") expect(getGridRegistry(state.doc).has(id)).toBe(false);
                else expect(getGridRegistry(state.doc).get(id)?.get("query")).toBe("SELECT 2 AS value");
            });
        }
    }

    for (const intervention of ["delete", "replace-and-cancel", "deny-writes", "navigate"] as const) {
        it(`handlePaste refuses post-allocation ${intervention} before dispatch and history`, async () => {
            const destination = state.doc;
            const outline = destination.getMap("clipboard-outline");
            const manager = new Y.UndoManager(outline);
            state.undoManager = manager;
            globalUndoRouter.clear();
            globalUndoRouter.register(manager);
            let entered!: () => void;
            let release!: () => void;
            const acquired = new Promise<void>(done => entered = done);
            const gate = new Promise<void>(done => release = done);
            sourceTransport.acquire = async () => {
                entered();
                await gate;
                return undefined;
            };
            const encoded = JSON.stringify({
                version: 3,
                sourceProjectId: "foreign-project",
                items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }, {
                    text: "sibling",
                    depth: 0,
                }],
                tables: { "source-table": snapshot("source-table") },
                grids: { "grid:source-table": gridSnapshot("source-table") },
            });
            const event = pasteEvent(encoded, "captured text");
            let dispatched = false;
            const listener = () => {
                dispatched = true;
                outline.set("paste", "effect");
            };
            window.addEventListener("paste-multi-item", listener);
            const pasting = KeyEventHandler.handlePaste(event);
            await acquired;
            const id = [...getGridRegistry(destination).keys()][0];
            expect(id).toBeTruthy();
            let replacement: Y.Map<unknown> | undefined;
            const deny = (event: Event) => event.preventDefault();
            if (intervention === "deny-writes") window.addEventListener(GRID_PASTE_WRITE_CHECK_EVENT, deny);
            else if (intervention === "navigate") state.doc = new Y.Doc({ guid: "navigated-project" });
            else {
                const peer = new Y.Doc();
                Y.applyUpdate(peer, Y.encodeStateAsUpdate(destination));
                expect(removeGridWithPlacements(Project.fromDoc(peer), id)).toBe(true);
                if (intervention === "replace-and-cancel") {
                    globalUndoRouter.undo();
                    getGridRegistry(peer).get(id)!.set("name", "Peer replacement");
                }
                Y.applyUpdate(destination, Y.encodeStateAsUpdate(peer), "peer");
                replacement = getGridRegistry(destination).get(id);
                if (intervention === "replace-and-cancel") window.dispatchEvent(new Event(GRID_PASTE_CANCEL_EVENT));
            }
            const depths = [
                globalUndoRouter.undoDepth,
                globalUndoRouter.redoDepth,
                manager.undoStack.length,
                manager.redoStack.length,
            ];
            release();
            try {
                await pasting;
            } finally {
                window.removeEventListener("paste-multi-item", listener);
                window.removeEventListener(GRID_PASTE_WRITE_CHECK_EVENT, deny);
                globalUndoRouter.unregister(manager);
                manager.destroy();
            }
            expect(dispatched).toBe(false);
            expect(outline.size).toBe(0);
            expect(listTables(destination)).toEqual([]);
            expect(event.clipboardData?.getData(OUTLINER_ITEMS_MIME)).toBe(encoded);
            expect(getGridRegistry(destination).get(id)).toBe(replacement);
            expect([
                globalUndoRouter.undoDepth,
                globalUndoRouter.redoDepth,
                manager.undoStack.length,
                manager.redoStack.length,
            ]).toEqual(depths);
        });
    }

    it("reuses a surviving same-project Grid without a portable snapshot", async () => {
        createGrid(state.doc, { gridId: "grid:source-table", query: "SELECT 1" });
        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: state.doc.guid,
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }],
            tables: {},
        });

        const detail = await pasteAndCapture(encoded, "Grid");

        expect(detail?.structuredItems).toEqual([
            { text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" },
        ]);
        expect(listTables(state.doc)).toEqual([]);
    });

    it("pastes a payload of textless blocks, which carries no plain text of its own", async () => {
        // The copy side writes no caption for a block (#5024), so a copy made
        // only of blocks has an empty plain-text flavor. The payload is still
        // the whole paste and must not be discarded as "nothing on the board".
        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: state.doc.guid,
            items: [{ text: "", depth: 0, componentType: "calendar", calendarId: "calendar-1" }],
            tables: {},
        });

        // Neither of the two plain-text fallbacks may hand this paste text the
        // clipboard does not have, or the empty flavor would go untested.
        const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
        (window as Window & typeof globalThis & { lastCopiedText?: string; }).lastCopiedText = undefined;
        let detail: Record<string, unknown> | undefined;
        try {
            detail = await pasteAndCapture(encoded, "");
        } finally {
            if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
            else delete (navigator as unknown as { clipboard?: Clipboard; }).clipboard;
        }

        expect(detail?.structuredItems).toEqual([
            { text: "", depth: 0, componentType: "calendar", calendarId: "calendar-1" },
        ]);
    });

    it("does not leak Paste Special to the next paste after an empty clipboard", async () => {
        const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
        (window as Window & typeof globalThis & { lastCopiedText?: string; }).lastCopiedText = undefined;
        KeyEventHandler.handleKeyDown(
            new KeyboardEvent("keydown", {
                key: "v",
                ctrlKey: true,
                shiftKey: true,
            }),
        );
        try {
            await KeyEventHandler.handlePaste(pasteEvent("", ""));
        } finally {
            if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
            else delete (navigator as unknown as { clipboard?: Clipboard; }).clipboard;
        }

        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: state.doc.guid,
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }],
            tables: {},
        });
        const requested = vi.fn((event: Event) => {
            (event as CustomEvent<PasteSpecialRequest>).detail.resolve(undefined);
        });
        window.addEventListener(PASTE_SPECIAL_REQUEST_EVENT, requested);
        try {
            await KeyEventHandler.handlePaste(pasteEvent(encoded, "Grid"));
        } finally {
            window.removeEventListener(PASTE_SPECIAL_REQUEST_EVENT, requested);
        }

        expect(requested).not.toHaveBeenCalled();
    });

    it("imports only referenced foreign Grids and strips missing Grid and Calendar metadata", async () => {
        const copied = snapshot("source-table");
        const unused = snapshot("unused-table", "unused");
        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: "foreign-project",
            items: [
                { text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" },
                { text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:missing-table" },
                { text: "", depth: 0, componentType: "calendar", calendarId: "calendar-1" },
            ],
            tables: { "source-table": copied, "unused-table": unused },
            grids: { "grid:source-table": gridSnapshot("source-table") },
        });

        const detail = await pasteAndCapture(encoded, "Grid\nMissing\nCalendar");
        const tables = listTables(state.doc);

        expect(tables).toHaveLength(1);
        expect(tables[0].sqlName).toBe("sales");
        // The paste also creates a Grid for the freshly cloned Table so the
        // outline item binds to a Grid identity, not a Table.
        expect(detail?.structuredItems).toEqual([
            {
                text: "",
                depth: 0,
                componentType: "yjstable",
                yjsGridId: expect.any(String),
            },
            { text: "", depth: 0 },
            { text: "", depth: 0 },
        ]);
    });

    for (const fresh of [false, true]) {
        it(`mixed Grid/Calendar Paste maps reused Tables alongside fresh=${fresh}`, async () => {
            const source = new Y.Doc({ guid: "mixed-calendar-source" });
            const a = createPortableTable(source, "A", "a");
            const b = fresh ? createPortableTable(source, "B", "b") : undefined;
            const unrelated = createPortableTable(state.doc, "Unrelated A", "a");
            addRecord(getTableHandles(state.doc, unrelated)!, { id: "unrelated" }, "unrelated");
            if (fresh) {
                const unrelatedB = createPortableTable(state.doc, "Unrelated B", "b");
                addRecord(getTableHandles(state.doc, unrelatedB)!, { id: "unrelated-b" }, "unrelated-b");
            }
            const grid = fixtureGridId(a);
            const tables = exportTableStructures(source, [a]);
            const grids = { [grid]: exportGridSlice(source, grid) };
            await pasteAndCapture(
                JSON.stringify({
                    version: 3,
                    sourceProjectId: source.guid,
                    tables,
                    grids,
                    items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: grid }],
                }),
                "Grid",
            );
            const reused = listTables(state.doc).find(table => table.sqlName === "a_2")!;
            expect(reused.sqlName).toBe("a_2");
            addRecord(getTableHandles(state.doc, reused.tableId)!, { id: "keep-reused" }, "keep-reused");
            createScheduleRule(Project.fromDoc(state.doc), {
                targetTableId: reused.tableId,
                sql: "INSERT INTO {{table}} (id) VALUES ('1') RETURNING *",
                rrule: "FREQ=DAILY",
            });
            const schedules = state.doc.getMap("schedules").toJSON();
            if (b) {
                Object.assign(tables, exportTableStructures(source, [b]));
                Object.assign(grids, { [fixtureGridId(b)]: exportGridSlice(source, fixtureGridId(b)) });
            }
            const query = b ? "SELECT a.id AS id FROM a JOIN b ON a.id = b.id" : "SELECT id AS id FROM a";
            const settings = {
                name: "Shared query",
                query,
                viewType: "month",
                timezone: "Asia/Tokyo",
                groupAxes: [],
                laneOrder: [],
                roleTitle: "id",
            };
            const catalog = readSqlCatalog(source.guid, source);
            if (catalog.status !== "ready") throw new Error("catalog unavailable");
            const beforeTables = listTables(state.doc).map(table => ({
                id: table.tableId,
                data: getTableHandles(state.doc, table.tableId)!.data.toJSON(),
            }));
            const detail = await pasteAndCapture(
                JSON.stringify({
                    version: 3,
                    sourceProjectId: source.guid,
                    tables,
                    grids,
                    catalog: catalog.snapshot,
                    calendars: { calendar: settings },
                    items: [
                        { text: "", depth: 0, componentType: "yjstable", yjsGridId: grid },
                        ...(b ? [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: fixtureGridId(b) }] : []),
                        { text: "", depth: 0, componentType: "calendar", calendarId: "calendar" },
                    ],
                }),
                "Grid\nCalendar",
            );
            expect(detail).toBeDefined();
            expect(state.doc.getMap("schedules").toJSON()).toEqual(schedules);
            const calendar = [...state.doc.getMap<Y.Map<unknown>>("calendars").values()][0];
            expect(calendar?.get("query")).toBe(
                b ? "SELECT a_2.id AS id FROM a_2 JOIN b_2 ON a_2.id = b_2.id" : "SELECT id AS id FROM a_2",
            );
            expect(calendar?.get("name")).toBe(settings.name);
            expect(calendar?.get("timezone")).toBe(settings.timezone);
            expect(
                getGridRegistry(state.doc).get(
                    (detail?.structuredItems as Array<{ yjsGridId: string; }> | undefined)?.[0].yjsGridId ?? "",
                )?.get("query"),
            ).toBe(
                "SELECT id FROM a_2",
            );
            expect(listTables(state.doc)).toHaveLength(fresh ? 4 : 2);
            for (const table of beforeTables) {
                expect(getTableHandles(state.doc, table.id)!.data.toJSON()).toEqual(table.data);
            }
            expect(listTables(state.doc).find(table => table.sqlName === "a_2")?.tableId).toBe(reused.tableId);
        });
    }

    for (const failure of [false, true]) {
        it(`mixed Calendar handler keeps native stacks and rolls back partial allocation: failure=${failure}`, async () => {
            const project = Project.fromDoc(state.doc);
            const page = project.addPage("Destination", "fixture");
            const manager = new Y.UndoManager(state.doc.getMap("orderedTree"));
            state.undoManager = manager;
            globalUndoRouter.register(manager);
            const existing = createCalendar(project, { name: "Unrelated", query: "" });
            const calendarManager = ensureCalendarUndoManager(project);
            manager.stopCapturing();
            calendarManager.stopCapturing();
            globalUndoRouter.clear();
            const before = [manager.undoStack.length, calendarManager.undoStack.length];
            const source = new Y.Doc({ guid: "calendar-history-source" });
            const enumSql = "CREATE TYPE calendar_state AS ENUM ('Open', 'Closed')";
            createSqlCatalogObject(source, "enum", enumSql);
            const destinationEnum = createSqlCatalogObject(state.doc, "enum", enumSql);
            const table = createPortableTable(source, "History", "history_records");
            const grid = fixtureGridId(table);
            const catalog = readSqlCatalog(source.guid, source);
            if (catalog.status !== "ready") throw new Error("catalog unavailable");
            const settings = {
                name: "Owned Calendar",
                query: "SELECT id::calendar_state AS id FROM history_records",
                viewType: "month",
                timezone: "Asia/Tokyo",
                roleTitle: "id",
                roleStart: "id",
                roleDuration: "id",
                roleDue: "id",
                groupAxes: ["id"],
                laneOrder: ["x", "y"],
                weekStart: 1,
                showEmptyLanes: true,
                workingHoursStartMinutes: 600,
                workingHoursEndMinutes: 1100,
                ganttScale: "quarter",
            };
            const encoded = JSON.stringify({
                version: 3,
                sourceProjectId: source.guid,
                tables: exportTableStructures(source, [table]),
                grids: { [grid]: exportGridSlice(source, grid) },
                catalog: catalog.snapshot,
                calendars: {
                    one: settings,
                    ...(failure ? { two: { ...settings, timezone: "invalid/timezone" } } : {}),
                },
                items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: grid }, {
                    text: "",
                    depth: 0,
                    componentType: "calendar",
                    calendarId: "one",
                }, ...(failure ? [{ text: "", depth: 0, componentType: "calendar", calendarId: "two" }] : [])],
            });
            const insert = (event: Event) =>
                state.doc.transact(() => {
                    for (const item of (event as CustomEvent).detail.structuredItems) {
                        const node = page.items.addNode("local");
                        const value = project.tree.getNodeValueFromKey(node.key) as Y.Map<unknown>;
                        value.set("componentType", item.componentType);
                        if (item.yjsGridId) value.set("yjsGridId", item.yjsGridId);
                        if (item.calendarId) value.set("calendarId", item.calendarId);
                    }
                });
            window.addEventListener("paste-multi-item", insert);
            try {
                const detail = await pasteAndCapture(encoded, "Grid\nCalendar");
                expect(calendarManager.undoStack.length).toBe(before[1]);
                expect(calendarManager.redoStack.length).toBe(0);
                if (failure) {
                    expect(detail).toBeUndefined();
                    expect(project.calendars.size).toBe(1);
                    expect(listTables(state.doc)).toEqual([]);
                    expect(getGridRegistry(state.doc).size).toBe(0);
                    expect(page.items.length).toBe(0);
                    expect(globalUndoRouter.undoDepth).toBe(0);
                    expect(manager.undoStack.length).toBe(before[0]);
                } else {
                    const saved = project.calendars.toJSON();
                    expect(globalUndoRouter.undoDepth).toBe(1);
                    for (let i = 0; i < 2; i++) {
                        globalUndoRouter.undo();
                        expect([...project.calendars.keys()]).toEqual([existing]);
                        expect(listTables(state.doc)).toEqual([]);
                        expect(page.items.length).toBe(0);
                        globalUndoRouter.redo();
                        expect(project.calendars.toJSON()).toEqual(saved);
                        expect(page.items.length).toBe(2);
                        expect(calendarManager.undoStack.length).toBe(before[1]);
                        expect(calendarManager.redoStack.length).toBe(0);
                        expect(globalUndoRouter.undoDepth).toBe(1);
                    }
                    globalUndoRouter.undo();
                    replaceSqlCatalogSource(
                        state.doc,
                        destinationEnum,
                        "CREATE TYPE calendar_state AS ENUM ('Closed', 'Open')",
                    );
                    const positions = [
                        globalUndoRouter.undoDepth,
                        globalUndoRouter.redoDepth,
                        manager.undoStack.length,
                        manager.redoStack.length,
                        calendarManager.undoStack.length,
                        calendarManager.redoStack.length,
                    ];
                    globalUndoRouter.redo();
                    expect([
                        globalUndoRouter.undoDepth,
                        globalUndoRouter.redoDepth,
                        manager.undoStack.length,
                        manager.redoStack.length,
                        calendarManager.undoStack.length,
                        calendarManager.redoStack.length,
                    ]).toEqual(positions);
                    expect(page.items.length).toBe(0);
                    expect([...project.calendars.keys()]).toEqual([existing]);
                    replaceSqlCatalogSource(state.doc, destinationEnum, enumSql);
                    globalUndoRouter.redo();
                    expect(project.calendars.toJSON()).toEqual(saved);
                    updateCalendar(project, existing, { name: "Legitimate independent edit" });
                    expect(globalUndoRouter.undoDepth).toBe(2);
                    globalUndoRouter.undo();
                    expect(project.calendars.get(existing)?.get("name")).toBe("Unrelated");
                }
            } finally {
                window.removeEventListener("paste-multi-item", insert);
                globalUndoRouter.unregister(manager);
                manager.destroy();
            }
        });
    }

    for (const queryKind of ["constant-enum", "outline-items", "empty", "whitespace"] as const) {
        it(`Calendar-only Copy retains definition replay authority: ${queryKind}`, async () => {
            const source = Project.createInstance(`calendar-only-${queryKind}`);
            const enumSql = "CREATE TYPE calendar_state AS ENUM ('Open', 'Closed')";
            const destinationEnum = queryKind === "constant-enum"
                ? createSqlCatalogObject(state.doc, "enum", enumSql)
                : undefined;
            if (destinationEnum) createSqlCatalogObject(source.ydoc, "enum", enumSql);
            const query = {
                "constant-enum": "SELECT 'event' AS id, CAST('Open' AS calendar_state) AS title",
                "outline-items": "SELECT id AS id, text AS title FROM outline_items",
                "empty": "",
                "whitespace": " \t\n ",
            }[queryKind];
            const sourceCalendar = createCalendar(source, { name: "Only Calendar", query, roleTitle: "title" });
            const copied = copySingleComponent(source.ydoc, undefined, sourceCalendar);
            const payload = deserializeClipboardItems(copied.encoded);
            expect(payload?.version).toBe(3);
            if (!payload || payload.version !== 3) throw new Error("Expected current clipboard payload");
            expect(Object.keys(payload.tables ?? {})).toEqual([]);
            expect(Object.keys(payload.grids ?? {})).toEqual([]);
            if (!destinationEnum) expect(payload.catalog?.objects).toEqual([]);
            const history = captureComponentPasteHistory();
            try {
                expect(await pasteAndCapture(copied.encoded, copied.text)).toBeDefined();
                expect(history.project.calendars.size).toBe(1);
                const [id] = history.project.calendars.keys();
                expect(id).not.toBe(sourceCalendar);
                expect(history.project.calendars.get(id)?.get("query")).toBe(query);
                expect(history.page.items.length).toBe(1);
                expect(listTables(state.doc)).toEqual([]);
                expect(getGridRegistry(state.doc).size).toBe(0);
                const saved = history.project.calendars.toJSON();
                const placement = history.page.items.at(0)!.id;
                expect(history.positions()).toEqual([1, 0, 1, 0, 0, 0]);
                globalUndoRouter.undo();
                expect(history.project.calendars.size).toBe(0);
                expect(history.page.items.length).toBe(0);
                globalUndoRouter.redo();
                expect(history.project.calendars.toJSON()).toEqual(saved);
                expect(history.page.items.at(0)!.id).toBe(placement);
                expect(history.positions()).toEqual([1, 0, 1, 0, 0, 0]);
                if (destinationEnum) {
                    globalUndoRouter.undo();
                    replaceSqlCatalogSource(
                        state.doc,
                        destinationEnum,
                        "CREATE TYPE calendar_state AS ENUM ('Closed', 'Open')",
                    );
                    const before = Y.encodeStateAsUpdate(state.doc);
                    const positions = history.positions();
                    const additions: string[] = [];
                    const observe: Parameters<typeof history.project.calendars.observe>[0] = event => {
                        for (const [key, change] of event.changes.keys) {
                            if (change.action === "add") additions.push(key);
                        }
                    };
                    history.project.calendars.observe(observe);
                    try {
                        globalUndoRouter.redo();
                        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
                        expect(Y.encodeStateAsUpdate(state.doc)).toEqual(before);
                        expect(history.positions()).toEqual(positions);
                        expect(additions).toEqual([]);
                        expect(history.project.calendars.size).toBe(0);
                        expect(history.page.items.length).toBe(0);
                    } finally {
                        history.project.calendars.unobserve(observe);
                    }
                    replaceSqlCatalogSource(state.doc, destinationEnum, enumSql);
                    globalUndoRouter.redo();
                    expect(history.project.calendars.toJSON()).toEqual(saved);
                    expect(history.page.items.at(0)!.id).toBe(placement);
                }
                expect(listTables(state.doc)).toEqual([]);
                expect(getGridRegistry(state.doc).size).toBe(0);
                expect(history.positions()).toEqual([1, 0, 1, 0, 0, 0]);
            } finally {
                history.dispose();
            }
        });
    }

    for (const requiredType of [false, true]) {
        it(`loaded-source Copy replay checks only required ENUM edits: required=${requiredType}`, async () => {
            const source = Project.createInstance(`loaded-catalog-${requiredType}`);
            const enumSql = "CREATE TYPE task_state AS ENUM ('Open', 'Closed')";
            const sourceEnum = requiredType ? createSqlCatalogObject(source.ydoc, "enum", enumSql) : undefined;
            if (sourceEnum) createSqlCatalogObject(state.doc, "enum", enumSql);
            const table = createPortableTable(source.ydoc);
            if (requiredType) {
                const schema = getTableHandles(source.ydoc, table)!.schemaText;
                schema.delete(0, schema.length);
                schema.insert(0, "CREATE TABLE sales (id TEXT PRIMARY KEY, state task_state)");
                getGridRegistry(source.ydoc).get(fixtureGridId(table))!.set("query", "SELECT id, state FROM sales");
            }
            const copied = copySingleComponent(source.ydoc, table);
            sourceTransport.loaded = source.ydoc;
            sourceTransport.acquire = async () => ({ client: { project: source }, release: () => {} });
            const history = captureComponentPasteHistory();
            try {
                expect(await pasteAndCapture(copied.encoded, copied.text)).toBeDefined();
                const [destinationTable] = listTables(state.doc);
                const [destinationGrid] = getGridRegistry(state.doc).keys();
                const placement = history.page.items.at(0)!.id;
                const savedGrid = getGridRegistry(state.doc).get(destinationGrid)!.toJSON();
                globalUndoRouter.undo();
                expect(listTables(state.doc)).toEqual([]);
                expect(getGridRegistry(state.doc).size).toBe(0);
                const peer = new Y.Doc();
                Y.applyUpdate(peer, Y.encodeStateAsUpdate(source.ydoc));
                if (sourceEnum) {
                    replaceSqlCatalogSource(peer, sourceEnum, "CREATE TYPE task_state AS ENUM ('Closed', 'Open')");
                } else createSqlCatalogObject(peer, "enum", "CREATE TYPE unrelated_state AS ENUM ('A', 'B')");
                Y.applyUpdate(source.ydoc, Y.encodeStateAsUpdate(peer), "peer");
                expect(sourceTransport.loaded).toBe(source.ydoc);
                const before = Y.encodeStateAsUpdate(state.doc);
                const sourceBefore = Y.encodeStateAsUpdate(source.ydoc);
                const positions = history.positions();
                globalUndoRouter.redo();
                if (requiredType) {
                    expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
                    expect(Y.encodeStateAsUpdate(state.doc)).toEqual(before);
                    expect(history.positions()).toEqual(positions);
                    expect(history.page.items.length).toBe(0);
                    expect(listTables(state.doc)).toEqual([]);
                    expect(getGridRegistry(state.doc).size).toBe(0);
                } else {
                    expect(history.positions()).toEqual([1, 0, 1, 0, 0, 0]);
                    expect(listTables(state.doc).map(entry => entry.tableId)).toEqual([destinationTable.tableId]);
                    expect(getGridRegistry(state.doc).get(destinationGrid)?.toJSON()).toEqual(savedGrid);
                    expect(history.page.items.at(0)!.id).toBe(placement);
                }
                expect(Y.encodeStateAsUpdate(source.ydoc)).toEqual(sourceBefore);
            } finally {
                history.dispose();
            }
        });
    }

    for (const changeCatalog of [false, true]) {
        it(`Calendar allocation revalidates after source acquisition: changed=${changeCatalog}`, async () => {
            const source = Project.createInstance(`calendar-acquisition-${changeCatalog}`);
            const enumSql = "CREATE TYPE calendar_state AS ENUM ('Open', 'Closed')";
            createSqlCatalogObject(source.ydoc, "enum", enumSql);
            const destinationEnum = createSqlCatalogObject(state.doc, "enum", enumSql);
            const calendar = createCalendar(source, {
                name: "Delayed Calendar",
                query: "SELECT 'event' AS id, CAST('Open' AS calendar_state) AS title",
                roleTitle: "title",
            });
            const copied = copySingleComponent(source.ydoc, undefined, calendar);
            const history = captureComponentPasteHistory();
            let entered!: () => void;
            let release!: () => void;
            const acquired = new Promise<void>(resolve => entered = resolve);
            const gate = new Promise<void>(resolve => release = resolve);
            sourceTransport.acquire = async () => {
                entered();
                await gate;
                return undefined;
            };
            const additions: string[] = [];
            const observe: Parameters<typeof history.project.calendars.observe>[0] = event => {
                for (const [key, change] of event.changes.keys) {
                    if (change.action === "add") additions.push(key);
                }
            };
            history.project.calendars.observe(observe);
            const pasting = pasteAndCapture(copied.encoded, copied.text);
            try {
                // This resolves only after the actual importer completed and the
                // handler entered the awaited source-acquisition operation.
                await acquired;
                expect(history.project.calendars.size).toBe(0);
                expect(history.page.items.length).toBe(0);
                if (changeCatalog) {
                    replaceSqlCatalogSource(
                        state.doc,
                        destinationEnum,
                        "CREATE TYPE calendar_state AS ENUM ('Closed', 'Open')",
                    );
                }
                const before = Y.encodeStateAsUpdate(state.doc);
                const positions = history.positions();
                release();
                const detail = await pasting;
                if (changeCatalog) {
                    expect(detail).toBeUndefined();
                    expect(additions).toEqual([]);
                    expect(Y.encodeStateAsUpdate(state.doc)).toEqual(before);
                    expect(history.positions()).toEqual(positions);
                    expect(history.project.calendars.size).toBe(0);
                    expect(history.page.items.length).toBe(0);
                } else {
                    expect(detail).toBeDefined();
                    expect(additions).toHaveLength(1);
                    expect(history.project.calendars.size).toBe(1);
                    expect(history.page.items.length).toBe(1);
                    expect(history.positions()).toEqual([1, 0, 1, 0, 0, 0]);
                }
                expect(listTables(state.doc)).toEqual([]);
                expect(getGridRegistry(state.doc).size).toBe(0);
            } finally {
                release();
                await pasting;
                history.project.calendars.unobserve(observe);
                history.dispose();
            }
        });
    }

    it("refuses a foreign Calendar cast when its captured ENUM is missing at the destination", async () => {
        const source = new Y.Doc({ guid: "calendar-source" });
        createSqlCatalogObject(source, "enum", "CREATE TYPE task_state AS ENUM ('Open', 'Closed')");
        const captured = readSqlCatalog(source.guid, source);
        if (captured.status !== "ready") throw new Error("catalog fixture unavailable");
        const encoded = JSON.stringify({
            version: 3,
            sourceProjectId: source.guid,
            items: [{ text: "", depth: 0, componentType: "calendar", calendarId: "calendar-1" }],
            calendars: {
                "calendar-1": {
                    name: "Typed calendar",
                    query: "SELECT id, text::task_state AS state FROM items",
                    viewType: "month",
                    groupAxes: [],
                    laneOrder: [],
                },
            },
            catalog: captured.snapshot,
        });

        const detail = await pasteAndCapture(encoded, "Calendar");

        expect(detail).toBeUndefined();
        expect(state.doc.getMap("calendars").size).toBe(0);
        expect(listTables(state.doc)).toEqual([]);
    });

    it("keeps foreign version 1 and all-failed version 2 pastes on plain-text fallback without debris", async () => {
        const version1 = JSON.stringify({
            version: 1,
            sourceProjectId: "foreign-project",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }],
        });
        const version1Detail = await pasteAndCapture(version1, "Grid\nPlain");
        expect(version1Detail?.structuredItems).toBeUndefined();

        const invalid = { ...snapshot("source-table"), schemaSql: "CREATE TABLE sales (" };
        const version2 = JSON.stringify({
            version: 2,
            sourceProjectId: "foreign-project",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }],
            tables: { "source-table": invalid },
        });
        const version2Detail = await pasteAndCapture(version2, "Grid\nPlain");

        expect(version2Detail?.structuredItems).toBeUndefined();
        expect(listTables(state.doc)).toEqual([]);
    });

    it("does not import before VS Code early-return paste modes", async () => {
        const cursor = { isActive: true, insertText: vi.fn() };
        state.cursors = [cursor];
        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: "foreign-project",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }],
            tables: { "source-table": snapshot("source-table") },
            grids: { "grid:source-table": gridSnapshot("source-table") },
        });
        const metadata = JSON.stringify({ multicursorText: ["Grid"], pasteMode: "spread" });

        const detail = await pasteAndCapture(encoded, "Grid", metadata);

        expect(cursor.insertText).toHaveBeenCalledWith("Grid");
        expect(detail).toBeUndefined();
        expect(listTables(state.doc)).toEqual([]);
    });

    it("cleans imported tables and does not dispatch stale ids after the active project changes", async () => {
        const destinationDoc = state.doc;
        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: "foreign-project",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsGridId: "grid:source-table" }],
            tables: { "source-table": snapshot("source-table") },
            grids: { "grid:source-table": gridSnapshot("source-table") },
        });
        let dispatched = false;
        const listener = () => {
            dispatched = true;
        };
        window.addEventListener("paste-multi-item", listener);
        try {
            const paste = KeyEventHandler.handlePaste(pasteEvent(encoded, "Grid"));
            state.doc = new Y.Doc();
            await paste;
        } finally {
            window.removeEventListener("paste-multi-item", listener);
        }

        expect(dispatched).toBe(false);
        expect(listTables(destinationDoc)).toEqual([]);
        expect(listTables(state.doc)).toEqual([]);
    });
});

describe("Paste Special component variant availability", () => {
    const payload = {
        version: 2 as const,
        sourceProjectId: "source-project",
        items: [{ text: "", depth: 0, componentType: "yjstable" as const, yjsGridId: "grid:source-table" }],
        tables: { "source-table": snapshot("source-table") },
        grids: { "grid:source-table": gridSnapshot("source-table") },
    };

    it("offers all variants in the source project", () => {
        const choices = pasteSpecialChoices(payload, "source-project");
        expect(choices.map(choice => [choice.variant, choice.available, choice.isDefault])).toEqual([
            ["another-view", true, true],
            ["copy-with-data", true, false],
            ["copy-without-data", true, false],
            ["values-only", true, false],
        ]);
    });

    it("disables another view with a reason in another project", () => {
        const choices = pasteSpecialChoices(payload, "destination-project");
        expect(choices.map(choice => [choice.variant, choice.available, choice.isDefault])).toEqual([
            ["another-view", false, false],
            ["copy-with-data", true, true],
            ["copy-without-data", true, false],
            ["values-only", true, false],
        ]);
        expect(choices[0].reason).toBe("The source component belongs to another project");
    });
});
