import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../schema/app-schema";
import { deserializeClipboardItems, OUTLINER_ITEMS_MIME } from "../services/clipboard/itemClipboard";
import { DIAGRAM_CLIPBOARD_RESULT_EVENT, type DiagramClipboardResult } from "../services/diagram/diagramClipboard";
import { invalidatePendingCut } from "../services/diagram/diagramClipboardTransfer";
import { getDiagram, listDiagrams, setDiagramSource } from "../services/diagram/diagramService";
import {
    addDiagram,
    addOccurrence,
    addText,
    createFixture,
    type Fixture,
    outline,
} from "../tests/fixtures/diagramClipboardFixture";
import { KeyEventHandler } from "./KeyEventHandler";

// Svelte store mocks as permitted by AGENTS.md: the clipboard handlers read the
// selection, cursors and visible rows from module-level stores. The project,
// its outline tree, Diagram registry and undo history are real Yjs state, and
// the copy → payload → paste route is the production one end to end.
vi.mock("../stores/CommandPaletteStore.svelte", () => ({
    commandPaletteStore: { isVisible: false, hide: vi.fn() },
}));
vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: { isVisible: false, hide: vi.fn() },
}));
vi.mock("./yjsService.svelte", () => ({
    acquireClientByProjectId: () => Promise.resolve(undefined),
}));

type Endpoint = { kind: "node-boundary"; itemId: string; side: "before" | "after"; } | {
    kind: "text";
    itemId: string;
    offset: number;
};

const state: {
    fx: Fixture | undefined;
    visible: Array<{ model: { id: string; original: Item; }; depth: number; }>;
    selection: { startItemId: string; endItemId: string; start: Endpoint; end: Endpoint; } | undefined;
    cursor: { itemId: string; inSource: boolean; };
    cutSelectedText: ReturnType<typeof vi.fn>;
    insertText: ReturnType<typeof vi.fn>;
} = {
    fx: undefined,
    visible: [],
    selection: undefined,
    cursor: { itemId: "", inSource: false },
    cutSelectedText: vi.fn(),
    insertText: vi.fn(),
};

vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        get selections() {
            return state.selection
                ? { local: { ...state.selection, startOffset: 0, endOffset: 0, userId: "local" } }
                : {};
        },
        getSelectedText: () => "",
        getTextareaRef: () => undefined,
        getLocalCursorInstances: () => [{
            isActive: true,
            userId: "local",
            itemId: state.cursor.itemId,
            isOnDiagramOccurrence: () => state.cursor.inSource,
            insertText: state.insertText,
            cutSelectedText: state.cutSelectedText,
        }],
        getActiveItem: () => state.cursor.itemId,
        clearSelections: vi.fn(),
        startCursorBlink: vi.fn(),
    },
}));

vi.mock("../stores/store.svelte", () => ({
    store: {
        get project() {
            return state.fx?.project;
        },
        get currentPage() {
            return state.fx?.page;
        },
        activeViewModel: { getVisibleItems: () => state.visible },
    },
}));

function clipboardEvent() {
    const data = new Map<string, string>();
    const event = {
        clipboardData: {
            setData: (format: string, value: string) => data.set(format, value),
            getData: (format: string) => data.get(format) ?? "",
        },
        preventDefault: vi.fn(),
        isTrusted: false,
    } as unknown as ClipboardEvent;
    return { event, data };
}

function showRows(...rows: Array<[Item, number]>) {
    state.visible = rows.map(([original, depth]) => ({ model: { id: original.id, original }, depth }));
}

/** Select whole nodes from the start of `first` to the end of `last`. */
function selectWhole(first: Item, last: Item) {
    const edge = (item: Item, side: "before" | "after"): Endpoint =>
        item.componentType ? { kind: "node-boundary", itemId: item.id, side } : {
            kind: "text",
            itemId: item.id,
            offset: side === "before" ? 0 : String(item.text).length,
        };
    state.selection = {
        startItemId: first.id,
        endItemId: last.id,
        start: edge(first, "before"),
        end: edge(last, "after"),
    };
}

describe("KeyEventHandler Diagram clipboard route (#5314)", () => {
    const results: DiagramClipboardResult[] = [];
    const record = (event: Event) => results.push((event as CustomEvent<DiagramClipboardResult>).detail);
    let fx: Fixture;

    beforeEach(() => {
        document.body.innerHTML = `<div class="outliner"><textarea class="global-textarea"></textarea></div>`;
        (document.querySelector("textarea") as HTMLTextAreaElement).focus();
        fx = createFixture();
        state.fx = fx;
        state.selection = undefined;
        state.cursor = { itemId: "", inSource: false };
        state.cutSelectedText = vi.fn();
        state.insertText = vi.fn();
        results.length = 0;
        window.addEventListener(DIAGRAM_CLIPBOARD_RESULT_EVENT, record);
    });
    afterEach(() => {
        window.removeEventListener(DIAGRAM_CLIPBOARD_RESULT_EVENT, record);
        invalidatePendingCut();
        fx.dispose();
    });

    async function paste(data: Map<string, string>, anchor: Item) {
        state.cursor.itemId = anchor.id;
        state.selection = undefined;
        const { event } = clipboardEvent();
        (event.clipboardData as unknown as { getData: (f: string) => string; }).getData = f => data.get(f) ?? "";
        await KeyEventHandler.handlePaste(event);
        return results.at(-1);
    }

    it("copies a whole transclusion as a snapshot and pastes an independent Diagram", async () => {
        const d = addDiagram(fx.project, "graph TD\n  A-->B");
        const occurrence = addOccurrence(fx.page, d);
        const anchor = addText(fx.page, "anchor");
        showRows([occurrence, 0], [anchor, 0]);
        selectWhole(occurrence, occurrence);
        const { event, data } = clipboardEvent();
        KeyEventHandler.handleCopy(event);

        const payload = deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME)!);
        expect(payload).toMatchObject({
            version: 4,
            diagrams: { [d]: { format: "mermaid", source: "graph TD\n  A-->B" } },
        });
        // External text destinations receive the source.
        expect(data.get("text/plain")).toBe("graph TD\n  A-->B");

        setDiagramSource(fx.project, d, "changed after copy");
        const result = await paste(data, anchor);
        expect(result).toMatchObject({ ok: true, operation: "paste" });
        const e = result!.ok ? result!.diagramIdMap![d] : "";
        expect(getDiagram(fx.project, e)?.source).toBe("graph TD\n  A-->B");
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "anchor", `diagram:${e}`]);
        expect(state.insertText).not.toHaveBeenCalled();
    });

    it("copies a Diagram folded beneath a whole Text node rather than dropping it", () => {
        const d = addDiagram(fx.project, "x");
        const parent = addText(fx.page, "folded parent");
        addOccurrence(parent, d);
        const next = addText(fx.page, "next");
        // The parent is collapsed: its Diagram child is not a visible row.
        showRows([parent, 0], [next, 0]);
        selectWhole(parent, next);
        const { event, data } = clipboardEvent();
        KeyEventHandler.handleCopy(event);
        expect(deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME)!)?.items).toEqual([
            { text: "folded parent", depth: 0 },
            { text: "", depth: 1, componentType: "diagram", diagramId: d },
            { text: "next", depth: 0 },
        ]);
        expect(data.get("text/plain")).toBe("folded parent\nx\nnext");
    });

    it("stages a Cut without removing anything, moves on Paste and refuses the replay", async () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        const target = addText(fx.page, "target");
        showRows([occurrence, 0], [target, 0]);
        selectWhole(occurrence, occurrence);
        const { event, data } = clipboardEvent();
        KeyEventHandler.handleCut(event);

        expect(results.at(-1)).toMatchObject({ ok: true, operation: "cut" });
        expect(state.cutSelectedText).not.toHaveBeenCalled();
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "target"]);
        expect(deserializeClipboardItems(data.get(OUTLINER_ITEMS_MIME)!)).toMatchObject({ operation: "cut" });

        expect(await paste(data, target)).toMatchObject({ ok: true, itemIds: [occurrence.id] });
        expect(outline(fx.page)).toEqual(["target", `diagram:${d}`]);
        expect(await paste(data, target)).toMatchObject({ ok: false, reason: "already-consumed" });
        expect(outline(fx.page)).toEqual(["target", `diagram:${d}`]);
        expect(listDiagrams(fx.project)).toHaveLength(1);
    });

    it("a later Copy invalidates the pending Cut, which then never degrades into a Copy", async () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        const target = addText(fx.page, "target");
        showRows([occurrence, 0], [target, 0]);
        selectWhole(occurrence, occurrence);
        const cut = clipboardEvent();
        KeyEventHandler.handleCut(cut.event);
        selectWhole(target, target);
        KeyEventHandler.handleCopy(clipboardEvent().event);

        expect(await paste(cut.data, target)).toMatchObject({ ok: false, reason: "stale-transfer" });
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "target"]);
        expect(listDiagrams(fx.project)).toHaveLength(1);
    });

    it("refuses a structural paste into Diagram source and an undecodable Diagram payload", async () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        const target = addText(fx.page, "target");
        showRows([occurrence, 0], [target, 0]);
        selectWhole(occurrence, occurrence);
        const { event, data } = clipboardEvent();
        KeyEventHandler.handleCopy(event);

        state.cursor.inSource = true;
        expect(await paste(data, occurrence)).toMatchObject({ ok: false, reason: "source-editing-target" });
        expect(getDiagram(fx.project, d)?.source).toBe("x");
        state.cursor.inSource = false;

        const corrupt = new Map(data);
        const payload = JSON.parse(data.get(OUTLINER_ITEMS_MIME)!);
        corrupt.set(OUTLINER_ITEMS_MIME, JSON.stringify({ ...payload, diagrams: {} }));
        expect(await paste(corrupt, target)).toMatchObject({ ok: false, reason: "unsupported-payload" });
        expect(state.insertText).not.toHaveBeenCalled();
        expect(outline(fx.page)).toEqual([`diagram:${d}`, "target"]);
        expect(listDiagrams(fx.project)).toHaveLength(1);
    });

    it("denies Cut staging on a read-only surface and writes nothing", () => {
        const d = addDiagram(fx.project, "x");
        const occurrence = addOccurrence(fx.page, d);
        showRows([occurrence, 0]);
        selectWhole(occurrence, occurrence);
        fx.surface.writable = false;
        const { event, data } = clipboardEvent();
        KeyEventHandler.handleCut(event);
        expect(results.at(-1)).toMatchObject({ ok: false, operation: "cut", reason: "capability-denied" });
        expect(data.size).toBe(0);
        expect(state.cutSelectedText).not.toHaveBeenCalled();

        // Copy needs read capability only.
        KeyEventHandler.handleCopy(event);
        expect(data.get(OUTLINER_ITEMS_MIME)).toBeTruthy();
    });
});
