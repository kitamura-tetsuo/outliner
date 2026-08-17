import { beforeEach, describe, expect, it } from "vitest";
import { pageViewStore } from "./PageViewStore.svelte";

describe("PageViewStore.rename", () => {
    beforeEach(() => {
        pageViewStore.reset();
    });

    it("carries the view count over to the new title", () => {
        pageViewStore.increment("Old Title");
        pageViewStore.increment("Old Title");

        pageViewStore.rename("Old Title", "New Title");

        expect(pageViewStore.get("New Title")).toBe(2);
        expect(pageViewStore.get("Old Title")).toBe(0);
    });

    it("merges into a count the new title already had", () => {
        pageViewStore.increment("Old Title");
        pageViewStore.increment("New Title");

        pageViewStore.rename("Old Title", "New Title");

        expect(pageViewStore.get("New Title")).toBe(2);
        expect("Old Title" in pageViewStore.counts).toBe(false);
    });

    it("ignores renames of untracked, empty or unchanged titles", () => {
        pageViewStore.increment("Old Title");

        pageViewStore.rename("Missing Page", "New Title");
        pageViewStore.rename("Old Title", "");
        pageViewStore.rename("Old Title", "Old Title");

        expect(pageViewStore.counts).toEqual({ "Old Title": 1 });
    });
});
