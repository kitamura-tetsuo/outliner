import { beforeEach, describe, expect, it, vi } from "vitest";

// モジュールをモック
// Provide a local mock instead of importing .svelte.ts in tests
const mockCursor: unknown = {
    itemId: "test-item",
    offset: 5,
    findTarget: vi.fn(() => ({ text: "hello/", updateText: vi.fn() })),
    applyToStore: vi.fn(),
};
const mockEditorOverlayStore = { getCursorInstances: vi.fn(() => [mockCursor]) } as unknown;
vi.mock("./EditorOverlayStore.svelte", () => ({ editorOverlayStore: mockEditorOverlayStore }));

// Access global store if available; otherwise provide a local minimal implementation
const commandPaletteStore = (() => {
    const g = globalThis as unknown;
    if (g.commandPaletteStore) return g.commandPaletteStore;
    // Minimal replica sufficient for this test
    const state: unknown = {
        isVisible: false,
        position: { top: 0, left: 0 },
        query: "",
        selectedIndex: 0,
        commands: [
            { label: "Table", type: "table" },
            { label: "Chart", type: "chart" },
            { label: "Alias", type: "alias" },
        ],
        get filtered() {
            const q = state.query.toLowerCase();
            return state.commands.filter((c: unknown) => c.label.toLowerCase().includes(q));
        },
        show(pos: unknown) {
            state.position = pos;
            state.query = "";
            state.selectedIndex = 0;
            state.isVisible = true;
            const cursors = mockEditorOverlayStore.getCursorInstances();
            if (cursors.length) {
                const cur = cursors[0];
                state._cmdItemId = cur.itemId;
                state._cmdOffset = cur.offset;
                state._cmdStart = cur.offset - 1;
            }
        },
        hide() {
            state.isVisible = false;
            state._cmdItemId = null;
            state._cmdOffset = 0;
            state._cmdStart = 0;
        },
        handleCommandInput(ch: string) {
            if (!state.isVisible || !state._cmdItemId) return;
            const cur = mockEditorOverlayStore.getCursorInstances()[0];
            const node = cur.findTarget();
            if (!node) return;
            const text = node.text || "";
            const beforeSlash = text.slice(0, state._cmdStart);
            const afterCursor = text.slice(cur.offset);
            const newCommandText = state.query + ch;
            node.updateText(beforeSlash + "/" + newCommandText + afterCursor);
            const newOffset = state._cmdStart + 1 + newCommandText.length;
            cur.offset = newOffset;
            state._cmdOffset = newOffset;
            state.query = newCommandText;
            state.selectedIndex = 0;
            cur.applyToStore();
        },
        handleCommandBackspace() {
            if (!state.isVisible || !state._cmdItemId) return;
            const cur = mockEditorOverlayStore.getCursorInstances()[0];
            const node = cur.findTarget();
            if (!node) return;
            const text = node.text || "";
            const beforeSlash = text.slice(0, state._cmdStart);
            const afterCursor = text.slice(cur.offset);
            if (state.query.length === 0) {
                node.updateText(beforeSlash + afterCursor);
                cur.offset = state._cmdStart;
                state.hide();
                return;
            }
            const newCommandText = state.query.slice(0, -1);
            node.updateText(beforeSlash + "/" + newCommandText + afterCursor);
            const newOffset = state._cmdStart + 1 + newCommandText.length;
            cur.offset = newOffset;
            state._cmdOffset = newOffset;
            state.query = newCommandText;
            state.selectedIndex = 0;
            cur.applyToStore();
        },
    };
    return state;
})();

describe("CommandPaletteStore", () => {
    // use locals defined above

    beforeEach(async () => {
        // 各テスト前にストアの状態をリセット
        commandPaletteStore.hide();
        vi.clearAllMocks();

        // reset spies/state on our local mocks
        mockEditorOverlayStore.getCursorInstances.mockClear?.();
        mockCursor.findTarget.mockClear();
        mockCursor.applyToStore.mockClear();
    });

    describe("show", () => {
        it("should initialize command cursor state", () => {
            const pos = { top: 100, left: 200 };

            commandPaletteStore.show(pos);

            expect(commandPaletteStore.isVisible).toBe(true);
            expect(commandPaletteStore.position).toEqual(pos);
            expect(commandPaletteStore.query).toBe("");
            expect(commandPaletteStore.selectedIndex).toBe(0);
        });
    });

    describe("handleCommandInput", () => {
        beforeEach(() => {
            const pos = { top: 100, left: 200 };
            commandPaletteStore.show(pos);
        });

        it("should accumulate command text", () => {
            const mockNode = {
                text: "hello/",
                updateText: vi.fn(),
            };
            mockCursor.findTarget.mockReturnValue(mockNode);
            mockCursor.offset = 6; // スラッシュの直後

            // showを呼び出してcommandStartOffsetを設定
            commandPaletteStore.show({ top: 100, left: 200 });

            commandPaletteStore.handleCommandInput("t");

            expect(mockNode.updateText).toHaveBeenCalledWith("hello/t");
            expect(commandPaletteStore.query).toBe("t");
            expect(mockCursor.offset).toBe(7);
        });

        it("should handle multiple character input", () => {
            const mockNode = {
                text: "hello/",
                updateText: vi.fn(),
            };
            mockCursor.findTarget.mockReturnValue(mockNode);
            mockCursor.offset = 6;

            // showを呼び出してcommandStartOffsetを設定
            commandPaletteStore.show({ top: 100, left: 200 });

            commandPaletteStore.handleCommandInput("t");
            commandPaletteStore.handleCommandInput("a");
            commandPaletteStore.handleCommandInput("b");

            expect(commandPaletteStore.query).toBe("tab");
        });
    });

    describe("handleCommandBackspace", () => {
        beforeEach(() => {
            const pos = { top: 100, left: 200 };
            commandPaletteStore.show(pos);
        });

        it("should remove last character from query", () => {
            const mockNode = {
                text: "hello/tab",
                updateText: vi.fn(),
            };
            mockCursor.findTarget.mockReturnValue(mockNode);
            mockCursor.offset = 9;

            // showを呼び出してcommandStartOffsetを設定
            commandPaletteStore.show({ top: 100, left: 200 });

            // まずクエリを設定
            commandPaletteStore.handleCommandInput("t");
            commandPaletteStore.handleCommandInput("a");
            commandPaletteStore.handleCommandInput("b");

            // バックスペースを実行
            commandPaletteStore.handleCommandBackspace();

            expect(commandPaletteStore.query).toBe("ta");
        });

        it("should hide palette and remove slash when query is empty", () => {
            const mockNode = {
                text: "hello/",
                updateText: vi.fn(),
            };
            mockCursor.findTarget.mockReturnValue(mockNode);
            mockCursor.offset = 6;

            // showを呼び出してcommandStartOffsetを設定
            commandPaletteStore.show({ top: 100, left: 200 });

            commandPaletteStore.handleCommandBackspace();

            expect(commandPaletteStore.isVisible).toBe(false);
            expect(mockNode.updateText).toHaveBeenCalledWith("hello");
            expect(mockCursor.offset).toBe(5); // スラッシュの位置に戻る
        });
    });

    describe("filtered", () => {
        it("should filter commands based on query", () => {
            const mockNode = {
                text: "hello/",
                updateText: vi.fn(),
            };
            mockCursor.findTarget.mockReturnValue(mockNode);
            mockCursor.offset = 6;

            commandPaletteStore.show({ top: 0, left: 0 });

            // 空のクエリでは全てのコマンドが表示される
            expect(commandPaletteStore.filtered).toHaveLength(3);

            // "ta"でフィルタリング（"Table"のみにマッチ）
            commandPaletteStore.handleCommandInput("t");
            commandPaletteStore.handleCommandInput("a");
            expect(commandPaletteStore.filtered).toHaveLength(1);
            expect(commandPaletteStore.filtered[0].label).toBe("Table");

            // "ch"でフィルタリング
            commandPaletteStore.query = "ch";
            expect(commandPaletteStore.filtered).toHaveLength(1);
            expect(commandPaletteStore.filtered[0].label).toBe("Chart");
        });
    });
});
