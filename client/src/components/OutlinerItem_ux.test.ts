import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutlinerItem from "./OutlinerItem.svelte";
import * as Y from "yjs";

// Mock dependencies
vi.mock("$app/navigation", () => ({
    goto: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
    getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    }),
}));

vi.mock("../stores/store.svelte", () => ({
    store: {
        currentPage: { items: [] },
        openCommentItemId: null,
        openCommentItemIndex: null,
    },
}));

vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        getItemCursorsAndSelections: () => ({ cursors: [], isActive: false }),
        getTextareaRef: () => null,
        setTextareaRef: vi.fn(),
        subscribe: () => () => {},
    },
}));

vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: {
        lastConfirmedItemId: null,
        lastConfirmedTargetId: null,
        lastConfirmedAt: null,
        tick: 0,
    },
}));

// Setup simple mock model based on OutlinerItemViewModel interface
function createMockModel(id: string) {
    const ydoc = new Y.Doc();
    const item = {
        id,
        parent: null,
        indexInParent: () => 0,
        delete: vi.fn(),
        toggleVote: vi.fn(),
        addNode: vi.fn(),
        votes: [],
        comments: new Y.Array(),
        ydoc,
        tree: {
            getNodeValueFromKey: () => new Y.Map(),
        },
        key: 'some-key',
    };

    return {
        id,
        original: item,
        text: "Test Item",
        votes: [],
        author: "author",
        created: Date.now(),
        lastChanged: Date.now(),
        commentCount: 0
    };
}

describe("OutlinerItem UX", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should have correct tooltip and aria-label for collapse button", async () => {
        const model = createMockModel("item-1");

        // Render OutlinerItem with children (so collapse button appears)
        render(OutlinerItem, {
            model: model as any,
            hasChildren: true,
            isCollapsed: false,
            index: 0
        });

        const collapseBtn = screen.getByLabelText("Collapse item");
        expect(collapseBtn).toBeInTheDocument();

        // Verify the newly added tooltip
        expect(collapseBtn).toHaveAttribute("title", "Collapse");
    });

    it("should display correct tooltip and aria-label when collapsed", async () => {
        const model = createMockModel("item-1");

        render(OutlinerItem, {
            model: model as any,
            hasChildren: true,
            isCollapsed: true,
            index: 0
        });

        const expandBtn = screen.getByLabelText("Expand item");
        expect(expandBtn).toBeInTheDocument();

        // Verify the newly added tooltip
        expect(expandBtn).toHaveAttribute("title", "Expand");
    });
});
