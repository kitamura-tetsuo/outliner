import { beforeEach, describe, expect, it } from "vitest";
import { searchHistoryStore } from "./SearchHistoryStore.svelte";

describe("SearchHistoryStore.rename", () => {
    beforeEach(() => {
        searchHistoryStore.reset();
    });

    it("moves an entry to the new title, keeping its position", () => {
        searchHistoryStore.add("Old Title");
        searchHistoryStore.add("Another Page");

        searchHistoryStore.rename("Old Title", "New Title");

        expect(searchHistoryStore.history).toEqual(["Another Page", "New Title"]);
    });

    it("does not duplicate a title the history already holds", () => {
        searchHistoryStore.add("New Title");
        searchHistoryStore.add("Old Title");

        searchHistoryStore.rename("Old Title", "New Title");

        expect(searchHistoryStore.history).toEqual(["New Title"]);
    });

    it("ignores renames of untracked, empty or unchanged titles", () => {
        searchHistoryStore.add("Old Title");

        searchHistoryStore.rename("Missing Page", "New Title");
        searchHistoryStore.rename("Old Title", "");
        searchHistoryStore.rename("Old Title", "Old Title");

        expect(searchHistoryStore.history).toEqual(["Old Title"]);
    });
});
