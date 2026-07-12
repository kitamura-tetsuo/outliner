import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { store } from "../../stores/store.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import DemoPage from "./+page.svelte";

// Mock dependencies
vi.mock("../../lib/demoSeed", () => ({
    seedDemo: vi.fn().mockResolvedValue(undefined),
    DEMO_PROJECT_NAME: "demo",
}));

vi.mock("../../services", () => ({
    getYjsClientByProjectTitle: vi.fn().mockResolvedValue({
        getProject: () => ({
            ydoc: new Y.Doc(),
        }),
        dispose: vi.fn(),
    }),
    removeYjsClientByProjectId: vi.fn(),
}));

vi.mock("../../schema/app-schema", async () => {
    const actual = await vi.importActual("../../schema/app-schema");
    return {
        ...actual,
        Project: {
            fromDoc: vi.fn().mockImplementation((doc: Y.Doc) => {
                // Actually return a proper object that looks like Project to avoid Yjs warnings
                return {
                    ydoc: doc,
                    tree: {}
                };
            }),
        }
    };
});

describe("Demo Page Reset Button", () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();

        // Reset stores to default states
        store.project = undefined;
        store.currentPage = undefined;

        // Mock internal properties that are expected to be available
        Object.defineProperty(store, "pages", { value: { current: [] }, configurable: true });
        Object.defineProperty(store, "pagesVersion", { get: () => 0, set: () => {}, configurable: true });

        yjsStore.yjsClient = undefined;
    });

    it("should render reset button with default styles when not loading or resetting", async () => {
        render(DemoPage);

        // Wait for initializeDemo to finish
        await new Promise(resolve => setTimeout(resolve, 0));

        const resetButton = screen.getByTestId("demo-reset-button");

        expect(resetButton).toBeInTheDocument();
        // Since initializeDemo finished, it should not be loading or resetting
        expect(resetButton).not.toBeDisabled();
        expect(resetButton).toHaveClass("bg-blue-600");
        expect(resetButton).toHaveClass("text-white");
        expect(resetButton).toHaveClass("hover:bg-blue-700");

        // Ensure it doesn't have the disabled classes
        expect(resetButton).not.toHaveClass("bg-gray-300");
        expect(resetButton).not.toHaveClass("text-gray-500");
        expect(resetButton).not.toHaveClass("cursor-not-allowed");
    });

    it("should apply disabled styling to the reset button during reset", async () => {
        render(DemoPage);

        // Wait for initializeDemo to finish
        await new Promise(resolve => setTimeout(resolve, 0));

        const resetButton = screen.getByTestId("demo-reset-button");

        // Trigger a reset
        await fireEvent.click(resetButton);

        // After click, isResetting should be true
        expect(resetButton).toBeDisabled();
        expect(resetButton).toHaveClass("bg-gray-300");
        expect(resetButton).toHaveClass("text-gray-500");
        expect(resetButton).toHaveClass("cursor-not-allowed");

        // Ensure it doesn't have the active classes
        expect(resetButton).not.toHaveClass("bg-blue-600");
        expect(resetButton).not.toHaveClass("hover:bg-blue-700");
    });
});
