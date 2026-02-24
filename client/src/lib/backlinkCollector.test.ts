import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectBacklinks, getBacklinkCount } from "./backlinkCollector";

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
        // @ts-expect-error - mock store
        store.pages.current = [];
        // @ts-expect-error - mock store
        store.project.title = "TestProject";
        vi.clearAllMocks();
    });

    it("should return empty array if no pages", () => {
        const result = collectBacklinks("TargetPage");
        expect(result).toEqual([]);
    });

    it("should return empty array if target page name is empty", () => {
        const result = collectBacklinks("");
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
        // @ts-expect-error - mock store
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
        // @ts-expect-error - mock store
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
        // @ts-expect-error - mock store
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
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(0);
    });

    it("should collect project links", () => {
        const mockPages = [
            {
                id: "page1",
                text: "Link to [/TestProject/TargetPage]",
                items: [],
            },
        ];
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(1);
        expect(result[0].sourcePageId).toBe("page1");
    });

    it("should extract context around link", () => {
        const longText = "This is a very long text that should be truncated when extracting context. It contains a link to [TargetPage] and more text after it to ensure truncation works correctly.";
        const mockPages = [
            {
                id: "page1",
                text: longText,
                items: [],
            },
        ];
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(1);
        expect(result[0].context).toContain("[TargetPage]");
        expect(result[0].context.length).toBeLessThan(longText.length);
        expect(result[0].context).toContain("...");
    });

    it("should handle project title being empty", () => {
        // @ts-expect-error - mock store
        store.project.title = "";
        const mockPages = [
            {
                id: "page1",
                text: "Link to [TargetPage]",
                items: [],
            },
        ];
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(1);
    });

    it("should use iterateUnordered if available", () => {
        const mockItems = [
            { id: "item1", text: "[TargetPage]" },
        ];
        const mockItemsIterable = {
            [Symbol.iterator]: () => mockItems[Symbol.iterator](),
            iterateUnordered: vi.fn(() => mockItems[Symbol.iterator]()),
        };
        const mockPages = [
            {
                id: "page1",
                text: "Page 1",
                items: mockItemsIterable,
            },
        ];

        const mockPagesIterable = {
            [Symbol.iterator]: () => mockPages[Symbol.iterator](),
            iterateUnordered: vi.fn(() => mockPages[Symbol.iterator]()),
        };

        // @ts-expect-error - mock store
        store.pages.current = mockPagesIterable;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(1);
        expect(mockPagesIterable.iterateUnordered).toHaveBeenCalled();
        expect(mockItemsIterable.iterateUnordered).toHaveBeenCalled();
    });

    it("should handle errors gracefully", () => {
        // @ts-expect-error - mock store
        store.pages.current = {
            [Symbol.iterator]: () => { throw new Error("Iter error"); },
        };

        const result = collectBacklinks("TargetPage");
        expect(result).toEqual([]);
    });

    it("should return count via getBacklinkCount", () => {
        const mockPages = [
            { id: "p1", text: "[TargetPage]", items: [] },
            { id: "p2", text: "no link", items: [{ id: "i1", text: "[TargetPage]" }] },
        ];
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const count = getBacklinkCount("TargetPage");
        expect(count).toBe(2);
    });

    it("should handle links at boundaries", () => {
        const mockPages = [
            { id: "p1", text: "[TargetPage] at start", items: [] },
            { id: "p2", text: "at end [TargetPage]", items: [] },
        ];
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(2);
        expect(result[0].context).toBe("[TargetPage] at start");
        expect(result[1].context).toBe("at end [TargetPage]");
    });

    it("should handle multiple projects in links", () => {
        const mockPages = [
            { id: "p1", text: "[/OtherProject/TargetPage]", items: [] },
        ];
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const result = collectBacklinks("TargetPage");
        // NOTE: Currently collectBacklinks only matches current project or internal link.
        // It uses projectLinkPattern which is tied to store.project.title.
        // anyProjectLinkPattern is only used in extractContext.
        expect(result).toHaveLength(0); // Should be 0 based on current implementation
    });

    it("should handle special characters in page name", () => {
        const target = "Page (1) [2]";
        const mockPages = [
            { id: "p1", text: `Link to [${target}]`, items: [] },
        ];
        // @ts-expect-error - mock store
        store.pages.current = mockPages;

        const result = collectBacklinks(target);
        expect(result).toHaveLength(1);
    });
});
