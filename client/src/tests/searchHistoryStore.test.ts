import { beforeEach, describe, expect, it, vi } from "vitest";

let store: {
    history: string[];
    add: (query: string) => void;
    clear: () => void;
};

function getHistory() {
    return store.history;
}

describe("search history store", () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.resetModules();
        store = (await import("../stores/SearchHistoryStore.svelte")).searchHistoryStore;
    });

    it("stores titles with most recent first", () => {
        store.add("A");
        store.add("B");
        expect(getHistory()).toEqual(["B", "A"]);
        store.add("A");
        expect(getHistory()).toEqual(["A", "B"]);
    });

    it("truncates history to 20 items", () => {
        for (let i = 0; i < 25; i++) {
            store.add("P" + i);
        }
        const list = getHistory();
        expect(list.length).toBe(20);
        expect(list[0]).toBe("P24");
        expect(list[19]).toBe("P5");
    });
});
