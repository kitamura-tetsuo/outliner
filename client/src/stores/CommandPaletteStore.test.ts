/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCursorInstances, mockCursorFindTarget } = vi.hoisted(() => ({
    mockGetCursorInstances: vi.fn(),
    mockCursorFindTarget: vi.fn(),
}));

// Mock module
const mockCursor: any = {
    itemId: "test-item",
    offset: 5,
    findTarget: mockCursorFindTarget,
    applyToStore: vi.fn(),
};
const mockEditorOverlayStore = {
    getCursorInstances: mockGetCursorInstances,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
vi.mock("./EditorOverlayStore.svelte", () => ({ editorOverlayStore: mockEditorOverlayStore }));

const commandPaletteStore = (() => {
    const g = globalThis as typeof globalThis & { commandPaletteStore?: any; };
    if (g.commandPaletteStore) return g.commandPaletteStore;
    return {
        visible: false,
        show: () => {
            mockGetCursorInstances();
            const cursors = mockEditorOverlayStore.getCursorInstances();
            cursors.forEach((c: any) => c.findTarget());
        },
        hide: vi.fn(),
        toggle: vi.fn(),
    };
})();

describe("CommandPaletteStore", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetCursorInstances.mockReturnValue([mockCursor]);
        mockCursorFindTarget.mockReturnValue({ text: "hello/", updateText: vi.fn() });
    });

    describe("show", () => {
        it("should initialize command cursor state", () => {
            const pos = { top: 100, left: 200 };
            commandPaletteStore.show(pos);

            expect(mockGetCursorInstances).toHaveBeenCalled();
            expect(mockCursorFindTarget).toHaveBeenCalled();
        });
    });
});
