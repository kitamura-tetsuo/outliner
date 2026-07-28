import { beforeEach, describe, expect, it } from "vitest";
import {
    getDestinationHistory,
    pruneUnresolvableDestinations,
    recordDestination,
} from "./calendarDestinationHistory";

describe("calendarDestinationHistory", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("is empty for a project with no recorded destination", () => {
        expect(getDestinationHistory("proj-a")).toEqual([]);
    });

    it("records a destination and offers it back, most recent first", () => {
        recordDestination("proj-a", { parentKey: "key-1", label: "Tasks" });
        recordDestination("proj-a", { parentKey: "key-2", label: "Notes" });
        expect(getDestinationHistory("proj-a")).toEqual([
            { parentKey: "key-2", label: "Notes" },
            { parentKey: "key-1", label: "Tasks" },
        ]);
    });

    it("moves a re-used destination back to the front instead of duplicating it", () => {
        recordDestination("proj-a", { parentKey: "key-1", label: "Tasks" });
        recordDestination("proj-a", { parentKey: "key-2", label: "Notes" });
        recordDestination("proj-a", { parentKey: "key-1", label: "Tasks (renamed)" });
        expect(getDestinationHistory("proj-a")).toEqual([
            { parentKey: "key-1", label: "Tasks (renamed)" },
            { parentKey: "key-2", label: "Notes" },
        ]);
    });

    it("caps the history at 8 entries", () => {
        for (let i = 0; i < 10; i++) {
            recordDestination("proj-a", { parentKey: `key-${i}`, label: `Page ${i}` });
        }
        const history = getDestinationHistory("proj-a");
        expect(history.length).toBe(8);
        expect(history[0].parentKey).toBe("key-9");
        expect(history[7].parentKey).toBe("key-2");
    });

    it("scopes history per project", () => {
        recordDestination("proj-a", { parentKey: "key-1", label: "Tasks" });
        recordDestination("proj-b", { parentKey: "key-2", label: "Notes" });
        expect(getDestinationHistory("proj-a")).toEqual([{ parentKey: "key-1", label: "Tasks" }]);
        expect(getDestinationHistory("proj-b")).toEqual([{ parentKey: "key-2", label: "Notes" }]);
    });

    it("drops a destination pruneUnresolvableDestinations rejects, and persists the drop", () => {
        recordDestination("proj-a", { parentKey: "key-1", label: "Tasks" });
        recordDestination("proj-a", { parentKey: "key-2", label: "Notes" });

        const pruned = pruneUnresolvableDestinations("proj-a", (parentKey) => parentKey !== "key-1");
        expect(pruned).toEqual([{ parentKey: "key-2", label: "Notes" }]);
        expect(getDestinationHistory("proj-a")).toEqual([{ parentKey: "key-2", label: "Notes" }]);
    });

    it("leaves storage untouched when nothing needs pruning", () => {
        recordDestination("proj-a", { parentKey: "key-1", label: "Tasks" });
        const before = localStorage.getItem("calendarDestinationHistory:proj-a");

        const pruned = pruneUnresolvableDestinations("proj-a", () => true);

        expect(pruned).toEqual([{ parentKey: "key-1", label: "Tasks" }]);
        expect(localStorage.getItem("calendarDestinationHistory:proj-a")).toBe(before);
    });

    it("ignores malformed stored JSON rather than throwing", () => {
        localStorage.setItem("calendarDestinationHistory:proj-a", "not json");
        expect(getDestinationHistory("proj-a")).toEqual([]);
    });
});
