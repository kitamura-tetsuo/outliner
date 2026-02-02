import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorOverlay from "./EditorOverlay.svelte";

// Mock the stores
vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        selections: {},
        cursors: {},
        cursorVisible: true,
        animationPaused: false,
        stopCursorBlink: vi.fn(),
        startCursorBlink: vi.fn(),
        setCursorVisible: vi.fn(),
        subscribe: vi.fn((fn) => {
            fn(); // Execute immediately
            return () => {}; // Unsubscribe function
        }),
        getTextareaRef: vi.fn(),
        getLastActiveCursor: vi.fn(),
        getSelectedText: vi.fn(),
        getCursorInstances: vi.fn(() => []),
        getTextFromSelection: vi.fn(),
        isComposing: false,
        getActiveItem: vi.fn(),
    },
}));

vi.mock("../stores/PresenceStore.svelte", () => ({
    presenceStore: {
        users: {},
    },
}));

vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: {
        isVisible: false,
    },
}));

describe("EditorOverlay", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should render the debug button with English title", () => {
        render(EditorOverlay);
        const debugButton = screen.getByTitle("Toggle debug mode");
        expect(debugButton).toBeInTheDocument();
        expect(debugButton).toHaveTextContent("D");
    });

    it("should toggle debug mode when debug button is clicked", async () => {
        render(EditorOverlay);
        const debugButton = screen.getByTitle("Toggle debug mode");

        // Initially not active (assuming default is false)
        expect(debugButton).not.toHaveClass("active");

        // Click to toggle
        await fireEvent.click(debugButton);

        // Should be active now
        expect(debugButton).toHaveClass("active");
    });
});
