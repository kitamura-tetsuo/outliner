import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
    deserializeClipboardItems,
    type GridTableSnapshot,
    OUTLINER_ITEMS_MIME,
} from "../services/clipboard/itemClipboard";
import { createTable, listTables } from "../services/yjstable/tableDocs";
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

interface TestSelection {
    startItemId: string;
    startOffset: number;
    endItemId: string;
    endOffset: number;
    userId: string;
}

const state: {
    selection: TestSelection | undefined;
    visible: Array<{ model: { id: string; original: unknown; }; depth: number; }>;
    doc: Y.Doc;
    cursors: Array<{ isActive: boolean; insertText: ReturnType<typeof vi.fn>; }>;
} = { selection: undefined, visible: [], doc: new Y.Doc(), cursors: [] };

vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        get selections() {
            return state.selection ? { local: state.selection } : {};
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
            return { ydoc: state.doc, calendars: state.doc.getMap("calendars") };
        },
        activeViewModel: { getVisibleItems: () => state.visible },
    },
}));

/**
 * Minimal Fluid `Item` stub: `text` plus the node value map that carries the
 * component binding, which is all the clipboard path reads.
 */
function makeItem(id: string, text: string, tableId?: string, calendarId?: string) {
    const value = new Map<string, unknown>();
    if (tableId) {
        value.set("componentType", "yjstable");
        value.set("yjsTableId", tableId);
    } else if (calendarId) {
        value.set("componentType", "calendar");
        value.set("calendarId", calendarId);
    }
    return {
        id,
        text,
        key: id,
        tree: { getNodeValueFromKey: () => value },
    };
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
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY)`);
        handles.uiDef.set("query", `SELECT id FROM ${sqlName}`);
        handles.uiDef.set("components", new Y.Map());
        handles.uiDef.set("columnOrder", new Y.Array());
    });
}

function snapshot(sourceTableId: string, sqlName = "sales"): GridTableSnapshot {
    return {
        sourceTableId,
        name: "Sales",
        sqlName,
        schemaSql: `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY)`,
        ui: { query: `SELECT id FROM ${sqlName}`, components: {}, columnOrder: [] },
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

    it("flavors written; fallback path", () => {
        state.selection = {
            startItemId: "a",
            startOffset: 0,
            endItemId: "c",
            endOffset: 1,
            userId: "local",
        };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        const plainText = data.get("text/plain");
        expect(plainText).toBe("Intro text\nDatabase tables\nT");

        const htmlText = data.get("text/html");
        expect(htmlText).toContain("Intro text<br>Database tables<br>T");
    });

    it("keeps the Grid binding when the drag stops inside the edge items", () => {
        // Mouse drags rarely land on item boundaries: start mid-word, end mid-word.
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "text", depth: 0 },
            { text: "Database tables", depth: 0, componentType: "yjstable", yjsTableId: tableId },
            { text: "Trailing", depth: 0 },
        ]);
        expect(data.get("text/plain")).toBe("text\nDatabase tables\nTrailing");
    });

    it("names a text-less Grid host from the project's table registry", () => {
        state.visible[1] = { model: { id: "b", original: makeItem("b", "", tableId) }, depth: 0 };
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)?.[1]).toEqual({
            text: "Sales",
            depth: 0,
            componentType: "yjstable",
            yjsTableId: tableId,
        });
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
            { text: "Database tables", depth: 0, componentType: "yjstable", yjsTableId: tableId },
        ]);
    });

    it("does not copy a Grid the selection only stops at", () => {
        // The selection ends at offset 0 of the Grid host, so the host is an
        // endpoint the drag reached but never selected.
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Intro text") }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "Trailing text") }, depth: 0 },
            { model: { id: "b", original: makeItem("b", "Database tables", tableId) }, depth: 0 },
        ];
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "b", endOffset: 0, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(data.get(OUTLINER_ITEMS_MIME)).toBeUndefined();
        expect(data.get("text/plain")).toBe("selected");
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

    it("exports each unique Grid once and keeps successful snapshots when another export fails", () => {
        const invalidTableId = createTable(state.doc, "Invalid", "invalid");
        state.visible = [
            { model: { id: "a", original: makeItem("a", "First", tableId) }, depth: 0 },
            { model: { id: "b", original: makeItem("b", "Second", tableId) }, depth: 1 },
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

        const payload = deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME) ?? "");
        expect(payload?.version).toBe(2);
        expect(payload?.version === 2 ? Object.keys(payload.tables) : []).toEqual([tableId]);
        expect(payload?.items[2]).toEqual({
            text: "Invalid",
            depth: 0,
            componentType: "yjstable",
            yjsTableId: invalidTableId,
        });
    });

    it("keeps Calendar-only and all-failed Grid exports on version 1", () => {
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

        expect(deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME) ?? "")?.version).toBe(1);
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

    it("reuses same-project version 2 bindings even when their snapshot is missing", async () => {
        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: state.doc.guid,
            items: [{ text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
            tables: {},
        });

        const detail = await pasteAndCapture(encoded, "Grid");

        expect(detail?.structuredItems).toEqual([
            { text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: "source-table" },
        ]);
        expect(listTables(state.doc)).toEqual([]);
    });

    it("imports only referenced foreign Grids and strips missing Grid and Calendar metadata", async () => {
        const copied = snapshot("source-table");
        const unused = snapshot("unused-table", "unused");
        const encoded = JSON.stringify({
            version: 2,
            sourceProjectId: "foreign-project",
            items: [
                { text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: "source-table" },
                { text: "Missing", depth: 1, componentType: "yjstable", yjsTableId: "missing-table" },
                { text: "Calendar", depth: 0, componentType: "calendar", calendarId: "calendar-1" },
            ],
            tables: { "source-table": copied, "unused-table": unused },
        });

        const detail = await pasteAndCapture(encoded, "Grid\nMissing\nCalendar");
        const tables = listTables(state.doc);

        expect(tables).toHaveLength(1);
        expect(tables[0].sqlName).toBe("sales");
        expect(detail?.structuredItems).toEqual([
            { text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: tables[0].tableId },
            { text: "Missing", depth: 1 },
            { text: "Calendar", depth: 0 },
        ]);
    });

    it("keeps foreign version 1 and all-failed version 2 pastes on plain-text fallback without debris", async () => {
        const version1 = JSON.stringify({
            version: 1,
            sourceProjectId: "foreign-project",
            items: [{ text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
        });
        const version1Detail = await pasteAndCapture(version1, "Grid\nPlain");
        expect(version1Detail?.structuredItems).toBeUndefined();

        const invalid = { ...snapshot("source-table"), schemaSql: "CREATE TABLE sales (" };
        const version2 = JSON.stringify({
            version: 2,
            sourceProjectId: "foreign-project",
            items: [{ text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
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
            items: [{ text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
            tables: { "source-table": snapshot("source-table") },
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
            items: [{ text: "Grid", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
            tables: { "source-table": snapshot("source-table") },
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
