import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { Item } from "../schema/app-schema";
import { Cursor } from "./Cursor";
import { countLines, getCurrentColumn, getCurrentLineIndex, getLineEndOffset, getLineStartOffset } from "./cursor";

// Svelteストアのモック
// AGENTS.mdの指示に基づき、ストアの挙動を制御するためにvi.mockを使用します。
const mockTextareaElement = {
    focus: vi.fn(),
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    setSelectionRange: vi.fn(),
};
vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        subscribe: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
        updateCursor: vi.fn(),
        setCursor: vi.fn((opts: unknown) => `cursor-${opts.itemId}-${Math.random()}`),
        setActiveItem: vi.fn(),
        getTextareaRef: vi.fn(() => mockTextareaElement),
        startCursorBlink: vi.fn(),
        triggerOnEdit: vi.fn(),
        clearCursorForItem: vi.fn(),
        clearCursorAndSelection: vi.fn(),
        clearSelectionForUser: vi.fn(),
        setSelection: vi.fn(),
        selections: {}, // store.selections は Object.values で使われているのでオブジェクトのまま
        cursorInstances: new Map(), // store.cursorInstances.get のため Map インスタンスを設定
        cursors: {}, // store.cursors は Object.values で使われているのでオブジェクトのまま
        forceUpdate: vi.fn(),
    },
}));
vi.mock("../stores/store.svelte", () => ({
    store: {
        currentPage: undefined, // テストケース内で設定可能にする
        subscribe: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
    },
}));

// Itemのテストダブル
// AGENTS.mdの指示に基づき、Itemのインターフェースを満たす単純なテストダブルを使用します。
const createMockItem = (id: string, text: string, children: Item[] = []): Item => {
    const mockYDoc = {} as Y.Doc;
    const mockTree = {} as import("yjs-orderedtree").YTree;
    const mockKey = id;

    const item = {
        ydoc: mockYDoc,
        tree: mockTree,
        key: mockKey,
        id,
        text,
        items: children as unknown as import("../schema/yjs-schema").Items,
        updateText: vi.fn((newText: string) => {
            (item as { text: string; }).text = newText;
        }),
        delete: vi.fn(),
        parent: null,
    } as unknown as Item;
    return item;
};

describe("Cursor", () => {
    let cursor: Cursor;
    let mockCurrentPage: Item | undefined;

    beforeEach(async () => {
        // モックをリセット
        vi.clearAllMocks();
        mockTextareaElement.value = "";
        mockTextareaElement.selectionStart = 0;
        mockTextareaElement.selectionEnd = 0;

        // generalStore.currentPageのモックを設定
        const { store: generalStore } = await import("../stores/store.svelte");
        generalStore.currentPage = mockCurrentPage; // テストケース側で設定できるようにする

        cursor = new Cursor("test-cursor-id", {
            itemId: "item1",
            offset: 0,
            isActive: true,
            userId: "test-user",
        });

        // findTargetがモックアイテムを返すように設定
        vi.spyOn(cursor as unknown as { findTarget: () => Item | undefined; }, "findTarget").mockImplementation(() => {
            if (generalStore.currentPage && cursor.itemId === (generalStore.currentPage as Item).id) {
                return generalStore.currentPage as Item;
            }
            // 簡単な実装：ここでは深くネストしたアイテムの検索はモックしない
            // 必要に応じてテストケースごとに個別のモックアイテムを返すようにする
            const item = createMockItem(cursor.itemId, "Default text for " + cursor.itemId);
            if (generalStore.currentPage) {
                const items = (generalStore.currentPage as Item).items as unknown as Item[];
                const found = items.find((child: Item) => child.id === cursor.itemId);
                if (!found) {
                    items.push(item);
                }
            }
            return item;
        });
    });

    describe("Constructor and Properties", () => {
        it("should be defined and initialized with given options", () => {
            const opts = { itemId: "item-A", offset: 5, isActive: false, userId: "user-B" };
            const c = new Cursor("cursor-X", opts);
            expect(c).toBeDefined();
            expect(c.cursorId).toBe("cursor-X");
            expect(c.itemId).toBe("item-A");
            expect(c.offset).toBe(5);
            expect(c.isActive).toBe(false);
            expect(c.userId).toBe("user-B");
        });
    });

    describe("Text Helper Methods", () => {
        describe("countLines", () => {
            it("should count lines correctly", () => {
                expect(countLines("")).toBe(1);
                expect(countLines("hello")).toBe(1);
                expect(countLines("hello\nworld")).toBe(2);
                expect(countLines("hello\nworld\n")).toBe(3); // 末尾の改行も1行としてカウント
                expect(countLines("\nhello\nworld\n")).toBe(4);
            });
        });

        describe("getLineStartOffset", () => {
            const text = "line1\nline2\nline3";
            it("should return correct start offset for each line", () => {
                expect(getLineStartOffset(text, 0)).toBe(0); // line1
                expect(getLineStartOffset(text, 1)).toBe(6); // line2 (line1の長さ5 + \nの1)
                expect(getLineStartOffset(text, 2)).toBe(12); // line3 (line1の長さ5 + \nの1 + line2の長さ5 + \nの1)
            });
            it("should handle out of bounds line index", () => {
                expect(getLineStartOffset(text, 3)).toBe(18); // text.length (改行含む) + 1 (based on current impl)
                expect(getLineStartOffset(text, -1)).toBe(0);
            });
            it("should handle text with trailing newline", () => {
                const textWithTrailingNL = "line1\nline2\n";
                expect(getLineStartOffset(textWithTrailingNL, 0)).toBe(0);
                expect(getLineStartOffset(textWithTrailingNL, 1)).toBe(6);
                expect(getLineStartOffset(textWithTrailingNL, 2)).toBe(12); // The start of the empty line after the last \n
            });
        });

        describe("getLineEndOffset", () => {
            const text = "line1\nline2\nline3";
            it("should return correct end offset for each line (excluding newline char)", () => {
                expect(getLineEndOffset(text, 0)).toBe(5); // line1
                expect(getLineEndOffset(text, 1)).toBe(11); // line2
                expect(getLineEndOffset(text, 2)).toBe(17); // line3
            });
            it("should handle out of bounds line index returning text length", () => {
                expect(getLineEndOffset(text, 3)).toBe(17);
            });
            it("should handle text with trailing newline", () => {
                const textWithTrailingNL = "line1\nline2\n";
                expect(getLineEndOffset(textWithTrailingNL, 0)).toBe(5);
                expect(getLineEndOffset(textWithTrailingNL, 1)).toBe(11);
                expect(getLineEndOffset(textWithTrailingNL, 2)).toBe(12); // End of the empty line (which is also the end of the text)
            });
        });

        describe("getCurrentLineIndex", () => {
            const text = "line1\nline2\nline3";
            it("should return correct line index for given offset", () => {
                expect(getCurrentLineIndex(text, 0)).toBe(0); // l|ine1
                expect(getCurrentLineIndex(text, 5)).toBe(1); // line1| (current impl returns next line index)
                expect(getCurrentLineIndex(text, 6)).toBe(1); // \n|line2
                expect(getCurrentLineIndex(text, 11)).toBe(2); // line2| (current impl returns next line index)
                expect(getCurrentLineIndex(text, 12)).toBe(2); // \n|line3
                expect(getCurrentLineIndex(text, 17)).toBe(2); // line3|
            });
            it("should handle offset exceeding text length", () => {
                expect(getCurrentLineIndex(text, 20)).toBe(2); // 最後の行を指す
            });
            it("should handle empty text", () => {
                expect(getCurrentLineIndex("", 0)).toBe(0);
            });
            it("should handle text with only newlines", () => {
                expect(getCurrentLineIndex("\n\n", 0)).toBe(1); // current impl
                expect(getCurrentLineIndex("\n\n", 1)).toBe(1);
                expect(getCurrentLineIndex("\n\n", 2)).toBe(2);
            });
        });

        describe("getCurrentColumn", () => {
            const text = "line1\n  line2\nline3"; // line2 has leading spaces
            it("should return correct column for given offset", () => {
                expect(getCurrentColumn(text, 0)).toBe(0); // |line1
                expect(getCurrentColumn(text, 3)).toBe(3); // lin|e1
                expect(getCurrentColumn(text, 6)).toBe(0); // |  line2 (start of line2)
                expect(getCurrentColumn(text, 8)).toBe(2); //   |line2 (after spaces)
                expect(getCurrentColumn(text, 15)).toBe(1); // li|ne3 (offset 15 is 'i')
            });
        });
    });

    describe("Cursor Movement (Simple Offset Changes)", () => {
        beforeEach(async () => {
            const { store: generalStore } = await import("../stores/store.svelte");
            mockCurrentPage = createMockItem("page1", "Page Title", [createMockItem("item1", "Hello World")]);
            generalStore.currentPage = mockCurrentPage;
            cursor.itemId = "item1"; // Ensure cursor is on a valid item
            cursor.offset = 5; // Initial offset
            // findTargetがmockCurrentPage.items[0]を返すように
            vi.spyOn(cursor as unknown as { findTarget: () => Item | undefined; }, "findTarget").mockImplementation(
                () => {
                    const items = mockCurrentPage!.items as unknown as Item[];
                    return items.at ? items.at(0) : items[0];
                },
            );
            // Prevent actual navigation/merge for these simple tests
            vi.spyOn((cursor as unknown).editor, "mergeWithPreviousItem").mockImplementation(() => {});
            vi.spyOn((cursor as unknown).editor, "mergeWithNextItem").mockImplementation(() => {});
            // Mock navigateToItem to prevent actual navigation in simple tests
            vi.spyOn(cursor as unknown, "navigateToItem").mockImplementation(() => {});
        });

        it("moveLeft should decrease offset if offset > 0", () => {
            cursor.moveLeft();
            expect(cursor.offset).toBe(4);
        });

        it("moveLeft should not decrease offset if offset is 0 (and not navigate for this simple test)", () => {
            cursor.offset = 0;
            cursor.moveLeft(); // This would normally try to navigate
            expect(cursor.offset).toBe(0); // For this test, we only check offset if no navigation mock
        });

        it("moveRight should increase offset if offset < text length", () => {
            cursor.moveRight();
            expect(cursor.offset).toBe(6);
        });

        it("moveRight should not increase offset if offset is at text length (and not navigate for this simple test)", () => {
            const item = cursor.findTarget();
            cursor.offset = item!.text!.length;
            cursor.moveRight(); // This would normally try to navigate
            expect(cursor.offset).toBe(item!.text!.length);
        });
    });

    describe("Text Manipulation", () => {
        let mockItem: Item;

        beforeEach(async () => {
            mockItem = createMockItem("item1", "Hello World");
            const { store: generalStore } = await import("../stores/store.svelte");
            mockCurrentPage = createMockItem("page1", "Page Title", [mockItem]);
            generalStore.currentPage = mockCurrentPage;
            cursor.itemId = "item1";
            // findTargetがmockItemを返すように設定
            vi.spyOn(cursor as unknown, "findTarget").mockReturnValue(mockItem);
            // Prevent actual navigation/merge for these simple tests
            vi.spyOn((cursor as unknown).editor, "mergeWithPreviousItem").mockImplementation(() => {});
            vi.spyOn((cursor as unknown).editor, "mergeWithNextItem").mockImplementation(() => {});
        });

        it("insertText should insert character at current offset and update offset", () => {
            cursor.offset = 6; // After "Hello "
            cursor.insertText("S");
            expect(mockItem.text).toBe("Hello SWorld");
            expect(mockItem.updateText).toHaveBeenCalledWith("Hello SWorld");
            expect(cursor.offset).toBe(7);
        });

        it("insertText should insert text at the beginning", () => {
            cursor.offset = 0;
            cursor.insertText("Prefix ");
            expect(mockItem.text).toBe("Prefix Hello World");
            expect(mockItem.updateText).toHaveBeenCalledWith("Prefix Hello World");
            expect(cursor.offset).toBe(7);
        });

        it("insertText should insert text at the end", () => {
            cursor.offset = mockItem.text.length;
            cursor.insertText(" Suffix");
            expect(mockItem.text).toBe("Hello World Suffix");
            expect(mockItem.updateText).toHaveBeenCalledWith("Hello World Suffix");
            expect(cursor.offset).toBe(mockItem.text.length);
        });

        it("deleteBackward should delete character before current offset and update offset", () => {
            cursor.offset = 6; // After "Hello "
            cursor.deleteBackward();
            expect(mockItem.text).toBe("HelloWorld"); // Space deleted
            expect(mockItem.updateText).toHaveBeenCalledWith("HelloWorld");
            expect(cursor.offset).toBe(5);
        });

        it("deleteBackward should do nothing if offset is 0 (and not merge for this test)", () => {
            cursor.offset = 0;
            const originalText = mockItem.text;
            cursor.deleteBackward(); // This would normally try to merge
            expect(mockItem.text).toBe(originalText);
            expect(mockItem.updateText).not.toHaveBeenCalled(); // Or called with originalText if that's the behavior
            expect(cursor.offset).toBe(0);
        });

        it("deleteForward should delete character after current offset and not change offset", () => {
            cursor.offset = 5; // Before " World"
            cursor.deleteForward();
            expect(mockItem.text).toBe("HelloWorld"); // Space deleted
            expect(mockItem.updateText).toHaveBeenCalledWith("HelloWorld");
            expect(cursor.offset).toBe(5);
        });

        it("deleteForward should do nothing if offset is at end of text (and not merge for this test)", () => {
            cursor.offset = mockItem.text.length;
            const originalText = mockItem.text;
            cursor.deleteForward(); // This would normally try to merge
            expect(mockItem.text).toBe(originalText);
            // expect(mockItem.updateText).not.toHaveBeenCalled(); // Depending on implementation if it tries to merge
            expect(cursor.offset).toBe(mockItem.text.length);
        });

        it("deleteBackward at offset 0 triggers mergeWithPreviousItem", () => {
            cursor.offset = 0;
            const spy = vi.spyOn((cursor as unknown).editor, "mergeWithPreviousItem").mockImplementation(
                () => {},
            );
            cursor.deleteBackward();
            expect(spy).toHaveBeenCalled();
        });

        it("deleteForward on empty item triggers deleteEmptyItem", () => {
            // 空のアイテムを設定
            mockItem.text = "";
            cursor.offset = 0;
            const spy = vi.spyOn((cursor as unknown).editor, "deleteEmptyItem").mockImplementation(() => {});
            cursor.deleteForward();
            expect(spy).toHaveBeenCalled();
        });

        it("deleteForward on non-empty item at end triggers mergeWithNextItem", () => {
            // 空でないアイテムの末尾に設定
            mockItem.text = "Hello";
            cursor.offset = 5; // 末尾
            const spy = vi.spyOn((cursor as unknown).editor, "mergeWithNextItem").mockImplementation(
                () => {},
            );
            cursor.deleteForward();
            expect(spy).toHaveBeenCalled();
        });
    });

    describe("Extended navigation", () => {
        let mockItem: Item;

        beforeEach(async () => {
            mockItem = createMockItem("item1", "Hello World");
            const { store: generalStore } = await import("../stores/store.svelte");
            mockCurrentPage = createMockItem("page1", "Page Title", [mockItem]);
            generalStore.currentPage = mockCurrentPage;
            cursor.itemId = "item1";
            vi.spyOn(cursor as unknown, "findTarget").mockReturnValue(mockItem);
        });

        it("moveWordLeft and moveWordRight work correctly", () => {
            cursor.offset = mockItem.text.length;
            cursor.moveWordLeft();
            expect(cursor.offset).toBe(6);
            cursor.moveWordLeft();
            expect(cursor.offset).toBe(0);
            cursor.moveWordRight();
            expect(cursor.offset).toBe(5);
        });

        it("moveToDocumentStart and moveToDocumentEnd", () => {
            const other = createMockItem("item2", "Second");
            (mockCurrentPage!.items as unknown).push(other);
            cursor.moveToDocumentEnd();
            expect(cursor.itemId).toBe("item2");
            expect(cursor.offset).toBe(other.text.length);
            cursor.moveToDocumentStart();
            expect(cursor.itemId).toBe("item1");
            expect(cursor.offset).toBe(0);
        });
    });
});
