import { beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "../stores/store.svelte";
import { collectBacklinks } from "./backlinkCollector";

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

        const pages = store.pages.current as any;
        expect(pages.iterateUnordered).toHaveBeenCalled();
        expect(pages[Symbol.iterator]).not.toHaveBeenCalled();
    });
});
