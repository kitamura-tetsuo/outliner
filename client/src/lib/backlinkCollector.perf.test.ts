import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectBacklinks } from "./backlinkCollector";
import { store } from "../stores/store.svelte";

// Mock implementation
vi.mock("../stores/store.svelte", () => {
    // Create mock functions
    const iterateUnordered = vi.fn().mockReturnValue((function*() {
        // Yield nothing to keep it simple
    })());
    const iterator = vi.fn().mockReturnValue((function*() {
        // Yield nothing
    })());

    return {
        store: {
            pages: {
                current: {
                    iterateUnordered: iterateUnordered,
                    [Symbol.iterator]: iterator,
                },
            },
            project: {
                title: "TestProject",
            },
        },
    };
});

describe("backlinkCollector performance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should use iterateUnordered if available for pages", () => {
        collectBacklinks("TargetPage");

        const pages = store.pages.current as { iterateUnordered: unknown; [Symbol.iterator]: unknown; };
        expect(pages.iterateUnordered).toHaveBeenCalled();
        expect(pages[Symbol.iterator]).not.toHaveBeenCalled();
    });
});
