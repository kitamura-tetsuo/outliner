import { beforeEach, describe, expect, it, vi } from "vitest";
import { deserializeClipboardItems, OUTLINER_ITEMS_MIME } from "../services/clipboard/itemClipboard";
import { KeyEventHandler } from "./KeyEventHandler";

// Svelte store mocks as permitted by AGENTS.md: the copy path reads the
// selection and the visible item list, both of which live in module-level stores.
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
} = { selection: undefined, visible: [] };

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
        project: { ydoc: { guid: "project-1" } },
        activeViewModel: { getVisibleItems: () => state.visible },
    },
}));

// The table name is only used as a fallback for component items without text.
vi.mock("../services/yjstable/tableDocs", () => ({ getTableName: () => "Sales" }));
vi.mock("../services/calendar/calendarService", () => ({ getCalendar: () => undefined }));

/**
 * Minimal Fluid/Yjs item stub: `text` plus the node value map the clipboard
 * serializer reads the component binding from.
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

describe("KeyEventHandler.handleCopy component bindings", () => {
    beforeEach(() => {
        document.body.innerHTML = `<div class="outliner"><textarea class="global-textarea"></textarea></div>`;
        (document.querySelector("textarea") as HTMLTextAreaElement).focus();
        state.visible = [
            { model: { id: "a", original: makeItem("a", "Intro text") }, depth: 0 },
            { model: { id: "b", original: makeItem("b", "Database tables", "table-1") }, depth: 0 },
            { model: { id: "c", original: makeItem("c", "Trailing text") }, depth: 0 },
        ];
    });

    it("keeps the Grid binding when the drag stops inside the edge items", () => {
        // Mouse drags rarely land on item boundaries: start mid-word, end mid-word.
        state.selection = { startItemId: "a", startOffset: 6, endItemId: "c", endOffset: 8, userId: "local" };
        const { event, data } = copyEvent();

        KeyEventHandler.handleCopy(event);

        const payload = deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME) ?? "");
        expect(payload?.items).toEqual([
            { text: "text", depth: 0 },
            { text: "Database tables", depth: 0, componentType: "yjstable", yjsTableId: "table-1" },
            { text: "Trailing", depth: 0 },
        ]);
        expect(data.get("text/plain")).toBe("text\nDatabase tables\nTrailing");
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

        const payload = deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME) ?? "");
        expect(payload?.items).toEqual([
            { text: "Database tables", depth: 0, componentType: "yjstable", yjsTableId: "table-1" },
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

        const payload = deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME) ?? "");
        expect(payload?.items).toEqual([
            { text: "Intro text", depth: 0 },
            { text: "Trailing text", depth: 1 },
        ]);
    });
});
