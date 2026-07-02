import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { CursorEditor } from "../../../lib/cursor/CursorEditor";
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
    constructor(id: string, text: string) {
        this.id = id;
        this._text = text;
    }
    get text() {
        return { toString: () => this._text };
    }
    updateText(t: string) {
        this._text = t;
    }
}

function addChild(parentItem: FakeItem, child: FakeItem) {
    child.parent = parentItem.items;
    parentItem.items.push(child);
}

describe("CursorEditor.deleteMultiItemSelection with 3+ items", () => {
    let root: FakeItem, item1: FakeItem, item2: FakeItem, item3: FakeItem, item4: FakeItem;

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
        (generalStore as unknown as { currentPage: FakeItem; }).currentPage = root;
    });

    it("removes every item within the selection, not only the first", () => {
        const cursorCtx = {
            itemId: item2.id,
            offset: 0,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as any,
        };
        const editor = new CursorEditor(cursorCtx as any);

        editor.deleteMultiItemSelection({
            startItemId: item2.id,
            startOffset: 0,
            endItemId: item4.id,
            endOffset: item4._text.length,
            userId: "local",
            isReversed: false,
        } as any);

        expect(root.items.length).toBe(2);
        expect(item2._text).toBe("");
        expect(root.items.children.some(c => c.id === "item3")).toBe(false);
        expect(root.items.children.some(c => c.id === "item4")).toBe(false);
    });

    it("merges partial text from the first and last item and removes items in between", () => {
        const cursorCtx = {
            itemId: item2.id,
            offset: 3,
            userId: "local",
            isActive: true,
            clearSelection: vi.fn(),
            applyToStore: vi.fn(),
            findTarget: () => item2 as unknown as any,
        };
        const editor = new CursorEditor(cursorCtx as any);

        editor.deleteMultiItemSelection({
            startItemId: item2.id,
            startOffset: 3, // "Sec"
            endItemId: item4.id,
            endOffset: 6, // after "Fourth"
            userId: "local",
            isReversed: false,
        } as any);

        expect(root.items.length).toBe(2);
        expect(item2._text).toBe("Sec item text");
        expect(root.items.children.some(c => c.id === "item3")).toBe(false);
        expect(root.items.children.some(c => c.id === "item4")).toBe(false);
    });
});
