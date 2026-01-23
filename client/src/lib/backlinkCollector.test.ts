import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectBacklinks } from "./backlinkCollector";

// Mock the store module
vi.mock("../stores/store.svelte", () => {
    return {
        store: {
            pages: {
                current: [],
            },
            project: {
                title: "TestProject",
            },
        },
    };
});

import { store } from "../stores/store.svelte";

describe("backlinkCollector", () => {
    beforeEach(() => {
        // Reset store before each test
        // @ts-ignore
        store.pages.current = [];
        // @ts-ignore
        store.project.title = "TestProject";
    });

    it("should return empty array if no pages", () => {
        const result = collectBacklinks("TargetPage");
        expect(result).toEqual([]);
    });

    it("should collect backlinks from page text", () => {
        const mockPages = [
            {
                id: "page1",
                text: "Some text [TargetPage] here",
                items: [],
            },
        ];
        // @ts-ignore
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(1);
        expect(result[0].sourcePageId).toBe("page1");
        expect(result[0].sourcePageName).toBe("Some text [TargetPage] here");
    });

    it("should collect backlinks from child items", () => {
        const mockPages = [
            {
                id: "page1",
                text: "Page 1",
                items: [
                    {
                        id: "item1",
                        text: "Link to [TargetPage]",
                    },
                ],
            },
        ];
        // @ts-ignore
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(1);
        expect(result[0].sourcePageId).toBe("page1");
        expect(result[0].sourceItemId).toBe("item1");
    });

    it("should handle mixed case", () => {
        const mockPages = [
            {
                id: "page1",
                text: "Page 1",
                items: [
                    {
                        id: "item1",
                        text: "Link to [targetPage]",
                    },
                ],
            },
        ];
        // @ts-ignore
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(1);
    });

    it("should ignore self reference", () => {
        const mockPages = [
            {
                id: "target",
                text: "TargetPage", // Same as target
                items: [
                    {
                        id: "item1",
                        text: "Link to [TargetPage]",
                    },
                ],
            },
        ];
        // @ts-ignore
        store.pages.current = mockPages;

        // Implementation of collectBacklinks skips the page if pageText matches targetName
        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(0);
    });
});
