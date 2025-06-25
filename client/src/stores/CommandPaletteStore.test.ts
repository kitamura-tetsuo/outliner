import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

// モジュールをモック
vi.mock("./EditorOverlayStore.svelte", () => {
    const mockCursor = {
        itemId: "test-item",
        offset: 5,
        findTarget: vi.fn(() => ({
            text: "hello/",
            updateText: vi.fn(),
        })),
        applyToStore: vi.fn(),
    };

    return {
        editorOverlayStore: {
            getCursorInstances: vi.fn(() => [mockCursor]),
        },
    };
});

import { commandPaletteStore } from "./CommandPaletteStore.svelte";

describe("CommandPaletteStore", () => {
    let mockCursor: any;
    let mockEditorOverlayStore: any;

    beforeEach(async () => {
        // 各テスト前にストアの状態をリセット
        commandPaletteStore.hide();
        vi.clearAllMocks();

        // モックを再取得
        const { editorOverlayStore } = await import("./EditorOverlayStore.svelte");
        mockEditorOverlayStore = editorOverlayStore;
        mockCursor = mockEditorOverlayStore.getCursorInstances()[0];
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
            expect(commandPaletteStore.filtered).toHaveLength(2);

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
