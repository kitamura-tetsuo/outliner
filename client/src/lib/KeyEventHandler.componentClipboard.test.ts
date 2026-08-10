import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { deserializeClipboardItems, OUTLINER_ITEMS_MIME } from "../services/clipboard/itemClipboard";
import { createTable } from "../services/yjstable/tableDocs";
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
} = { selection: undefined, visible: [], doc: new Y.Doc() };

vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        get selections() {
            return state.selection ? { local: state.selection } : {};
        },
        getSelectedText: () => "selected",
        getTextareaRef: () => undefined,
        getLocalCursorInstances: () => [],
    },
}));

vi.mock("../stores/store.svelte", () => ({
    store: {
        get project() {
            return { ydoc: state.doc };
        },
        activeViewModel: { getVisibleItems: () => state.visible },
    },
}));

/**
 * Minimal Fluid `Item` stub: `text` plus the node value map that carries the
 * component binding, which is all the clipboard path reads.
 */
function makeItem(id: string, text: string, tableId?: string) {
    const value = new Map<string, unknown>();
    if (tableId) {
        value.set("componentType", "yjstable");
        value.set("yjsTableId", tableId);
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

describe("KeyEventHandler.handleCopy component bindings", () => {
    let tableId: string;

    beforeEach(() => {
        document.body.innerHTML = `<div class="outliner"><textarea class="global-textarea"></textarea></div>`;
        (document.querySelector("textarea") as HTMLTextAreaElement).focus();
        state.doc = new Y.Doc();
        tableId = createTable(state.doc, "Sales", "sales");
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
});
