import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for https://github.com/kitamura-tetsuo/outliner/issues/3357
//
// `Item.parent` (see schema/app-schema.ts and schema/yjs-schema.ts) resolves to the
// parent's *Items collection* directly - it does not return a node with a nested
// `.items` property. The fake tree below mirrors that shape so the test exercises
// the same contract as production code.

vi.mock("../../../stores/EditorOverlayStore.svelte", () => {
    const mockStore = {
        updateCursor: vi.fn(),
        setCursor: vi.fn(),
        setActiveItem: vi.fn(),
        getTextareaRef: vi.fn(),
        clearCursorForItem: vi.fn(),
        setSelection: vi.fn(),
        clearSelectionForUser: vi.fn(),
        startCursorBlink: vi.fn(),
        triggerOnEdit: vi.fn(),
        cursorInstances: new Map(),
        selections: {},
        isComposing: false,
    };
    return {
        editorOverlayStore: mockStore,
        store: mockStore,
    };
});

vi.mock("../../../stores/store.svelte", () => {
    return {
        store: {
            currentPage: null,
            project: null,
        },
    };
});

import type { CursorEditingContext } from "../../../lib/cursor/CursorEditor";
import { CursorEditor } from "../../../lib/cursor/CursorEditor";
import type { Item } from "../../../schema/yjs-schema";
import type { SelectionRange } from "../../../stores/EditorOverlayStore.svelte";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../../stores/store.svelte";

class FakeItems {
    children: FakeItem[] = [];
    [Symbol.iterator]() {
        return this.children[Symbol.iterator]();
    }
    get length() {
        return this.children.length;
    }
    at(i: number) {
        return this.children[i];
    }
    indexOf(item: FakeItem) {
        return this.children.indexOf(item);
    }
    removeAt(i: number) {
        this.children.splice(i, 1);
    }
    push(item: FakeItem) {
        this.children.push(item);
    }
}

class FakeItem {
    id: string;
    _text: string;
    items = new FakeItems();
    parent: FakeItems | undefined;
    componentType: string | undefined;
    constructor(id: string, text: string, componentType?: string) {
        this.id = id;
        this._text = text;
        this.componentType = componentType;
    }
    get text() {
        return { toString: () => this._text };
    }
    updateText(t: string) {
        this._text = t;
    }
    delete() {
        const index = this.parent?.indexOf(this) ?? -1;
        if (index >= 0) this.parent?.removeAt(index);
    }
}

function addChild(parentItem: FakeItem, child: FakeItem) {
    child.parent = parentItem.items;
    parentItem.items.push(child);
}

/**
 * A text selection as the store stores it: the flat offsets a caller states, plus the
 * endpoints they mean (#5025).
 */
function textSelectionFixture(
    range: {
        startItemId: string;
        startOffset: number;
        endItemId: string;
        endOffset: number;
        userId: string;
        isReversed?: boolean;
    },
): SelectionRange {
    return {
        ...range,
        start: { kind: "text", itemId: range.startItemId, offset: range.startOffset },
        end: { kind: "text", itemId: range.endItemId, offset: range.endOffset },
    };
}

function nodeBoundarySelectionFixture(
    range: {
        startItemId: string;
        startSide: "before" | "after";
        endItemId: string;
        endSide: "before" | "after";
        userId: string;
    },
): SelectionRange {
    return {
        startItemId: range.startItemId,
        startOffset: 0,
        endItemId: range.endItemId,
        endOffset: 0,
        userId: range.userId,
        start: { kind: "node-boundary", itemId: range.startItemId, side: range.startSide },
        end: { kind: "node-boundary", itemId: range.endItemId, side: range.endSide },
    };
}

describe("CursorEditor.deleteMultiItemSelection with 3+ items", () => {
    let root: FakeItem, item1: FakeItem, item2: FakeItem, item3: FakeItem, item4: FakeItem;
    let editor: CursorEditor | undefined;

    afterEach(() => {
        // deleteMultiItemSelection schedules a cursor-visibility recovery timer;
        // cancel it so it doesn't fire after this test's jsdom environment is torn down.
        editor?.destroy();
        editor = undefined;
    });

    beforeEach(() => {
        root = new FakeItem("root", "Title");
        item1 = new FakeItem("item1", "First item text");
        item2 = new FakeItem("item2", "Second item text");
        item3 = new FakeItem("item3", "Third item text");
        item4 = new FakeItem("item4", "Fourth item text");
        addChild(root, item1);
        addChild(root, item2);
        addChild(root, item3);
        addChild(root, item4);
        const mutableStore = generalStore as unknown as {
            currentPage: FakeItem;
            activeViewModel?: { isCollapsed: (itemId: string) => boolean; };
        };
        mutableStore.currentPage = root;
        mutableStore.activeViewModel = undefined;
        (editorOverlayStore.selections as Record<string, SelectionRange>) = {};
    });

    it("removes every item within the selection, not only the first", () => {
        const cursorCtx: CursorEditingContext = {
            itemId: item2.id,
            offset: 0,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteMultiItemSelection(textSelectionFixture({
            startItemId: item2.id,
            startOffset: 0,
            endItemId: item4.id,
            endOffset: item4._text.length,
            userId: "local",
            isReversed: false,
        }));

        expect(root.items.length).toBe(2);
        expect(item2._text).toBe("");
        expect(root.items.children.some(c => c.id === "item3")).toBe(false);
        expect(root.items.children.some(c => c.id === "item4")).toBe(false);
    });

    it("merges partial text from the first and last item and removes items in between", () => {
        const cursorCtx: CursorEditingContext = {
            itemId: item2.id,
            offset: 3,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteMultiItemSelection(textSelectionFixture({
            startItemId: item2.id,
            startOffset: 3, // "Sec"
            endItemId: item4.id,
            endOffset: 6, // after "Fourth"
            userId: "local",
            isReversed: false,
        }));

        expect(root.items.length).toBe(2);
        expect(item2._text).toBe("Sec item text");
        expect(root.items.children.some(c => c.id === "item3")).toBe(false);
        expect(root.items.children.some(c => c.id === "item4")).toBe(false);
    });

    it("keeps the unselected Text suffix when a selection starts on a visual node", () => {
        item2.componentType = "yjstable";
        item2._text = "";
        const cursorCtx: CursorEditingContext = {
            itemId: item2.id,
            offset: 0,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteMultiItemSelection(textSelectionFixture({
            startItemId: item2.id,
            startOffset: 0,
            endItemId: item4.id,
            endOffset: 6,
            userId: "local",
            isReversed: false,
        }));

        expect(root.items.children.map(item => item.id)).toEqual(["item1", "item4"]);
        expect(item4._text).toBe(" item text");
        expect(cursorCtx.itemId).toBe(item4.id);
        expect(cursorCtx.offset).toBe(0);
    });

    it("removes both visual endpoints and moves the caret before the selection", () => {
        item2.componentType = "yjstable";
        item2._text = "";
        item4.componentType = "calendar";
        item4._text = "";
        const cursorCtx: CursorEditingContext = {
            itemId: item2.id,
            offset: 0,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteMultiItemSelection(textSelectionFixture({
            startItemId: item2.id,
            startOffset: 0,
            endItemId: item4.id,
            endOffset: 0,
            userId: "local",
            isReversed: false,
        }));

        expect(root.items.children.map(item => item.id)).toEqual(["item1"]);
        expect(item1._text).toBe("First item text");
        expect(cursorCtx.itemId).toBe(item1.id);
        expect(cursorCtx.offset).toBe(item1._text.length);
    });

    it("deletes a single visual node selected from before to after", () => {
        item2.componentType = "yjstable";
        item2._text = "";
        const selection = nodeBoundarySelectionFixture({
            startItemId: item2.id,
            startSide: "before",
            endItemId: item2.id,
            endSide: "after",
            userId: "local",
        });
        (editorOverlayStore.selections as Record<string, SelectionRange>) = { local: selection };
        const cursorCtx: CursorEditingContext = {
            itemId: item2.id,
            offset: 0,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteSelection();

        expect(root.items.children.map(item => item.id)).toEqual(["item1", "item3", "item4"]);
        expect(cursorCtx.itemId).toBe(item1.id);
        expect(cursorCtx.offset).toBe(item1._text.length);
    });

    it("keeps a visual node when a mixed selection ends before it", () => {
        item2.componentType = "yjstable";
        item2._text = "";
        const cursorCtx: CursorEditingContext = {
            itemId: item1.id,
            offset: 5,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item1 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteMultiItemSelection({
            ...nodeBoundarySelectionFixture({
                startItemId: item1.id,
                startSide: "after",
                endItemId: item2.id,
                endSide: "before",
                userId: "local",
            }),
            startOffset: 5,
            start: { kind: "text", itemId: item1.id, offset: 5 },
        });

        expect(root.items.children.map(item => item.id)).toEqual(["item1", "item2", "item3", "item4"]);
        expect(item1._text).toBe("First");
    });

    it("keeps a visual node when a mixed selection starts after it", () => {
        item2.componentType = "yjstable";
        item2._text = "";
        const cursorCtx: CursorEditingContext = {
            itemId: item3.id,
            offset: 5,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item3 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteMultiItemSelection({
            ...nodeBoundarySelectionFixture({
                startItemId: item2.id,
                startSide: "after",
                endItemId: item3.id,
                endSide: "before",
                userId: "local",
            }),
            endOffset: 5,
            end: { kind: "text", itemId: item3.id, offset: 5 },
        });

        expect(root.items.children.map(item => item.id)).toEqual(["item1", "item2", "item3", "item4"]);
        expect(item3._text).toBe(" item text");
    });

    it("moves the caret to the visible predecessor instead of its collapsed descendant", () => {
        const hiddenChild = new FakeItem("hidden-child", "Hidden child text");
        addChild(item1, hiddenChild);
        item2.componentType = "yjstable";
        item2._text = "";
        item4.componentType = "calendar";
        item4._text = "";
        (generalStore as unknown as {
            activeViewModel: { isCollapsed: (itemId: string) => boolean; };
        }).activeViewModel = {
            isCollapsed: itemId => itemId === item1.id,
        };
        const cursorCtx: CursorEditingContext = {
            itemId: item2.id,
            offset: 0,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteMultiItemSelection(textSelectionFixture({
            startItemId: item2.id,
            startOffset: 0,
            endItemId: item4.id,
            endOffset: 0,
            userId: "local",
            isReversed: false,
        }));

        expect(root.items.children.map(item => item.id)).toEqual(["item1"]);
        expect(item1.items.children.map(item => item.id)).toEqual(["hidden-child"]);
        expect(cursorCtx.itemId).toBe(item1.id);
        expect(cursorCtx.offset).toBe(item1._text.length);
    });

    it("treats the visual node before a Text item atomically on Backspace", () => {
        item2.componentType = "calendar";
        item2._text = "";
        const cursorCtx: CursorEditingContext = {
            itemId: item3.id,
            offset: 0,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item3 as unknown as Item,
            moveToLineStart: vi.fn(),
            moveToLineEnd: vi.fn(),
        };
        editor = new CursorEditor(cursorCtx);

        editor.deleteBackward();

        expect(root.items.children.map(item => item.id)).toEqual(["item1", "item3", "item4"]);
        expect(item3._text).toBe("Third item text");
        expect(cursorCtx.itemId).toBe(item3.id);
        expect(cursorCtx.offset).toBe(0);
    });
});
