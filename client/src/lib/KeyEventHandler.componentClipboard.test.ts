import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Project } from "../schema/app-schema";
import { GRID_EXPORT_ROW_LIMIT } from "../services/clipboard/gridClipboardExport";
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
import { createTable, listTables } from "../services/yjstable/tableDocs";
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

// This file exercises clipboard serialization and the structure-only fallback.
// Reaching the live source room belongs to the cross-project E2E coverage, so
// the project registry reports the source as unavailable here instead of
// opening a WebSocket out of JSDOM.
vi.mock("./yjsService.svelte", () => ({
    acquireClientByProjectId: () => Promise.resolve(undefined),
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
    cursors: Array<{
        isActive: boolean;
        insertText: ReturnType<typeof vi.fn>;
        cutSelectedText?: ReturnType<typeof vi.fn>;
    }>;
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
 *
 * A Grid or Calendar node owns no outline text (#5015), so the stub reports
 * none for one - exactly as the schema's own `text` getter does.
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
        text: tableId || calendarId ? "" : text,
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
    return createTable(doc, name, sqlName, undefined, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY)`);
        handles.uiDef.set("query", `SELECT id FROM ${sqlName}`);
        handles.uiDef.set("components", new Y.Map());
        handles.uiDef.set("columnOrder", []);
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

    it("keeps the Grid binding when the drag stops inside the edge items", () => {
        // Mouse drags rarely land on item boundaries: start mid-word, end mid-word.
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "text", depth: 0 },
            { text: "", depth: 0, componentType: "yjstable", yjsTableId: tableId },
            { text: "Trailing", depth: 0 },
        ]);
        // Outward, an unrendered block contributes no line at all: its Table
        // name is not a caption the outline owns (#5024).
        expect(data.get("text/plain")).toBe("text\nTrailing");
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
            { text: "", depth: 0, componentType: "yjstable", yjsTableId: tableId },
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
            yjsTableId: tableId,
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
            { text: "", depth: 0, componentType: "yjstable", yjsTableId: tableId },
        ]);
        // Nothing textual is left to copy, and the block gets no caption to
        // stand in for it (#5024) - the binding alone is the copy.
        expect(data.get("text/plain")).toBe("");
    });

    it("cuts a selection of a lone block even though it writes no plain text", () => {
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

        // What was cut is on the clipboard as a binding, so the block has to
        // leave the outline: an empty plain-text flavor is not an empty cut.
        expect(copiedItems(data)?.[0].componentType).toBe("yjstable");
        expect(data.get("text/plain")).toBe("");
        expect(cutSelectedText).toHaveBeenCalled();
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
            { text: "", depth: 0, componentType: "yjstable", yjsTableId: tableId },
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

    it("exports each unique Grid once and keeps successful snapshots when another export fails", () => {
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

        const payload = deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME) ?? "");
        expect(payload?.version).toBe(2);
        expect(payload?.version === 2 ? Object.keys(payload.tables) : []).toEqual([tableId]);
        expect(payload?.items[2]).toEqual({
            text: "",
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
        first.yjsTableId = tableId;
        first.columnSpan = 4;
        const second = layout.items.addNode("tester");
        second.componentType = "yjstable";
        second.yjsTableId = tableId;
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
            { text: "", depth: 1, componentType: "yjstable", yjsTableId: tableId, columnSpan: 4 },
            { text: "", depth: 1, componentType: "yjstable", yjsTableId: tableId, columnSpan: 8 },
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
        registerTableClipboardSource(tableId, { getGrid: gridConfig, getChartImage: () => undefined });
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
        registerTableClipboardSource(tableId, { getGrid: gridConfig, getChartImage: () => undefined });
        selectWholeGridHost();
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        expect(copiedItems(data)).toEqual([
            { text: "Intro text", depth: 0 },
            { text: "", depth: 0, componentType: "yjstable", yjsTableId: tableId },
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
        registerTableClipboardSource(tableId, {
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
        registerTableClipboardSource(tableId, {
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
        registerTableClipboardSource(tableId, { getGrid: gridConfig, getChartImage: () => oversized });
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
        registerTableClipboardSource(tableId, {
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
        registerTableClipboardSource(tableId, first);
        registerTableClipboardSource(tableId, second);
        unregisterTableClipboardSource(tableId, first);

        expect(getTableClipboardSource(tableId)).toBe(second);
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
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
            tables: {},
        });

        const detail = await pasteAndCapture(encoded, "Grid");

        expect(detail?.structuredItems).toEqual([
            { text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" },
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
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
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
                { text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" },
                { text: "", depth: 0, componentType: "yjstable", yjsTableId: "missing-table" },
                { text: "", depth: 0, componentType: "calendar", calendarId: "calendar-1" },
            ],
            tables: { "source-table": copied, "unused-table": unused },
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
                yjsTableId: tables[0].tableId,
                yjsGridId: expect.any(String),
            },
            { text: "", depth: 0 },
            { text: "", depth: 0 },
        ]);
    });

    it("keeps foreign version 1 and all-failed version 2 pastes on plain-text fallback without debris", async () => {
        const version1 = JSON.stringify({
            version: 1,
            sourceProjectId: "foreign-project",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
        });
        const version1Detail = await pasteAndCapture(version1, "Grid\nPlain");
        expect(version1Detail?.structuredItems).toBeUndefined();

        const invalid = { ...snapshot("source-table"), schemaSql: "CREATE TABLE sales (" };
        const version2 = JSON.stringify({
            version: 2,
            sourceProjectId: "foreign-project",
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
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
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
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
            items: [{ text: "", depth: 0, componentType: "yjstable", yjsTableId: "source-table" }],
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

describe("Paste Special component variant availability", () => {
    const payload = {
        version: 2 as const,
        sourceProjectId: "source-project",
        items: [{ text: "", depth: 0, componentType: "yjstable" as const, yjsTableId: "source-table" }],
        tables: { "source-table": snapshot("source-table") },
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
