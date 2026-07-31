import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock module
const mockCursor = {
    itemId: "test-item",
    offset: 5,
    findTarget: vi.fn(() => ({ text: "hello/", updateText: vi.fn() })),
    applyToStore: vi.fn(),
};
const mockEditorOverlayStore = {
    getCursorInstances: vi.fn(() => [mockCursor]),
};

// Use global fallback for Svelte store mocks
vi.mock("./EditorOverlayStore.svelte", () => ({ editorOverlayStore: mockEditorOverlayStore }));

interface ICommandPaletteStore {
    hide: () => void;
    show: (pos: unknown) => void;
    handleCommandInput: (t: string) => void;
    handleCommandBackspace: () => void;
    isVisible: boolean;
    commandStartOffset: number;
    query: string;
}

describe("CommandPaletteStore Offset Arithmetic", () => {
    // We import the store after mocking to ensure it uses the mock
    let store: ICommandPaletteStore;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await import("./CommandPaletteStore.svelte");
        store = module.commandPaletteStore as unknown as ICommandPaletteStore;
        store.hide();
        mockCursor.findTarget.mockClear();
        mockCursor.applyToStore.mockClear();
    });

    describe("show", () => {
        it("should initialize command cursor state", () => {
            mockCursor.offset = 5;
            store.show({ top: 100, left: 200 });
            expect(store.isVisible).toBe(true);
            expect(store.commandStartOffset).toBe(4);
            expect(store.query).toBe("");
        });
    });

    describe("handleCommandInput", () => {
        beforeEach(() => {
            mockCursor.offset = 6;
            store.show({ top: 100, left: 200 });
        });

        it("should accumulate command text", () => {
            const mockNode = {
                text: "hello/",
                updateText: vi.fn(),
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockCursor.findTarget.mockReturnValue(mockNode as any);
            mockCursor.offset = 6;

            store.handleCommandInput("t");

            expect(mockNode.updateText).toHaveBeenCalledWith("hello/t");
            expect(store.query).toBe("t");
            expect(mockCursor.offset).toBe(7);
        });
    });

    describe("handleCommandBackspace", () => {
        beforeEach(() => {
            mockCursor.offset = 6;
            store.show({ top: 100, left: 200 });
        });

        it("should remove last character from query", () => {
            const mockNode = {
                text: "hello/tab",
                updateText: vi.fn(),
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockCursor.findTarget.mockReturnValue(mockNode as any);
            mockCursor.offset = 9;

            store.query = "tab";
            store.commandStartOffset = 5;

            store.handleCommandBackspace();

            expect(mockNode.updateText).toHaveBeenCalledWith("hello/ta");
            expect(store.query).toBe("ta");
            expect(mockCursor.offset).toBe(8);
        });

        it("should hide palette and remove slash when query is empty", () => {
            const mockNode = {
                text: "hello/",
                updateText: vi.fn(),
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockCursor.findTarget.mockReturnValue(mockNode as any);
            mockCursor.offset = 6;
            store.query = "";
            store.commandStartOffset = 5;

            store.handleCommandBackspace();

            expect(store.isVisible).toBe(false);
            expect(mockNode.updateText).toHaveBeenCalledWith("hello");
            expect(mockCursor.offset).toBe(5); // Return to slash position
        });
    });
});
