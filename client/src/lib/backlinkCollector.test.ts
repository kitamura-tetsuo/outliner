import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Project } from "../schema/app-schema";
import { Items } from "../schema/app-schema";
import { collectBacklinks, getHighlightSegments } from "./backlinkCollector";

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
        (store.pages as unknown as { current: unknown[]; }).current = [];
        (store.project as unknown as { title: string; }).title = "TestProject";
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
            } as unknown as import("../schema/app-schema").Item,
        ];
        (store.pages as unknown as { current: import("../schema/app-schema").Item[]; }).current = mockPages;

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
                    } as unknown as import("../schema/app-schema").Item,
                ] as unknown as Items,
            } as unknown as import("../schema/app-schema").Item,
        ];
        (store.pages as unknown as { current: import("../schema/app-schema").Item[]; }).current = mockPages;

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
                    } as unknown as import("../schema/app-schema").Item,
                ] as unknown as Items,
            } as unknown as import("../schema/app-schema").Item,
        ];
        (store.pages as unknown as { current: import("../schema/app-schema").Item[]; }).current = mockPages;

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
                    } as unknown as import("../schema/app-schema").Item,
                ] as unknown as Items,
            } as unknown as import("../schema/app-schema").Item,
        ];
        (store.pages as unknown as { current: import("../schema/app-schema").Item[]; }).current = mockPages;

        // Implementation of collectBacklinks skips the page if pageText matches targetName
        const result = collectBacklinks("TargetPage");
        expect(result).toHaveLength(0);
    });
});

describe("getHighlightSegments", () => {
    it("should correctly handle empty context or pageName", () => {
        expect(getHighlightSegments("", "Target")).toEqual([{ text: "", type: "normal" }]);
        expect(getHighlightSegments("Hello", "")).toEqual([{ text: "Hello", type: "normal" }]);
    });

    it("should split context correctly around internal links", () => {
        const segments = getHighlightSegments("Check [Target] here", "Target");
        expect(segments).toEqual([
            { text: "Check ", type: "normal" },
            { text: "[Target]", type: "highlight" },
            { text: " here", type: "normal" },
        ]);
    });

    it("should split context correctly around project internal links", () => {
        const segments = getHighlightSegments("Look at [/project/Target] page", "Target");
        expect(segments).toEqual([
            { text: "Look at ", type: "normal" },
            { text: "[/project/Target]", type: "highlight" },
            { text: " page", type: "normal" },
        ]);
    });

    it("should handle regex metacharacters in pageName", () => {
        const segments = getHighlightSegments("Look at [(Target)+.] page", "(Target)+.");
        expect(segments).toEqual([
            { text: "Look at ", type: "normal" },
            { text: "[(Target)+.]", type: "highlight" },
            { text: " page", type: "normal" },
        ]);
    });

    it("should not modify or execute HTML in context", () => {
        const segments = getHighlightSegments("XSS <script>alert(1)</script> [Target]", "Target");
        expect(segments).toEqual([
            { text: "XSS <script>alert(1)</script> ", type: "normal" },
            { text: "[Target]", type: "highlight" },
        ]);
    });
});

describe("deep nested items", () => {
    it("should detect backlinks in deep nested items", () => {
        const mockDoc = new Y.Doc();
        const tree = new YTree(mockDoc.getMap("orderedTree"));
        const project = new Project(mockDoc, tree);

        const _targetPage = project.addPage("TargetPage", "author");
        const sourcePage = project.addPage("SourcePage", "author");

        // Create a deeply nested structure
        const item1 = sourcePage.items.addNode("author");
        item1.updateText("Level 1");

        const item2 = item1.items.addNode("author");
        item2.updateText("Level 2");

        const item3 = item2.items.addNode("author");
        item3.updateText("Level 3 - link to [TargetPage]");

        store.pages = { current: project.items };

        const backlinks = collectBacklinks("TargetPage");
        expect(backlinks.length).toBe(1);
        expect(backlinks[0].sourceItemText).toBe("Level 3 - link to [TargetPage]");
    });
});
