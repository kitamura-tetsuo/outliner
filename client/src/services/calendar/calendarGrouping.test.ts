import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./calendarEntries";
import { collapseLanePath, entryAxisValues, flattenLaneEntries, groupCalendarEntries } from "./calendarGrouping";

function entry(key: string, raw: Record<string, unknown>): CalendarEntry {
    return { key, title: key, raw };
}

describe("groupCalendarEntries", () => {
    it("yields a single ungrouped lane when no axes are configured", () => {
        const entries = [entry("a", {}), entry("b", {})];
        const lanes = groupCalendarEntries(entries, []);
        expect(lanes).toEqual([{ value: undefined, path: [], entries }]);
    });

    it("groups by a scalar column into one lane per distinct value", () => {
        const entries = [
            entry("a", { kind: "item" }),
            entry("b", { kind: "table" }),
            entry("c", { kind: "item" }),
        ];
        const lanes = groupCalendarEntries(entries, ["kind"]);
        expect(lanes.map((l) => l.value)).toEqual(["item", "table"]);
        expect(lanes[0].entries.map((e) => e.key)).toEqual(["a", "c"]);
        expect(lanes[1].entries.map((e) => e.key)).toEqual(["b"]);
    });

    it("puts an item with no value for the axis in a NULL lane, sorted last", () => {
        const entries = [
            entry("tagged", { tags: JSON.stringify(["work"]) }),
            entry("untagged", { tags: JSON.stringify([]) }),
        ];
        const lanes = groupCalendarEntries(entries, ["tags"]);
        expect(lanes.map((l) => l.value)).toEqual(["work", undefined]);
        expect(lanes[1].entries.map((e) => e.key)).toEqual(["untagged"]);
    });

    it("NULL lane sorts last even when laneOrder says otherwise", () => {
        const entries = [entry("a", {}), entry("b", { axis: "z" })];
        const lanes = groupCalendarEntries(entries, ["axis"], { laneOrder: ["z", "a"] });
        expect(lanes.map((l) => l.value)).toEqual(["z", undefined]);
    });

    it("puts a multi-tagged item in every matching lane (JSON membership, not substring)", () => {
        const entries = [
            entry("both", { tags: JSON.stringify(["work", "design"]) }),
            entry("designer-text", { tags: JSON.stringify(["designer"]) }),
        ];
        const lanes = groupCalendarEntries(entries, ["tags"]);
        const byValue = Object.fromEntries(lanes.map((l) => [l.value, l.entries.map((e) => e.key)]));
        // "design" and "designer" are distinct lanes — never substring-matched.
        expect(byValue["design"]).toEqual(["both"]);
        expect(byValue["designer"]).toEqual(["designer-text"]);
        expect(byValue["work"]).toEqual(["both"]);
    });

    it("applies the configured lane order, falling back to locale order for unlisted values", () => {
        const entries = [
            entry("a", { axis: "gamma" }),
            entry("b", { axis: "alpha" }),
            entry("c", { axis: "beta" }),
        ];
        const lanes = groupCalendarEntries(entries, ["axis"], { laneOrder: ["beta", "gamma"] });
        // "beta" and "gamma" follow the configured order; "alpha" (unlisted) comes after both.
        expect(lanes.map((l) => l.value)).toEqual(["beta", "gamma", "alpha"]);
    });

    it("omits an empty lane by default, but keeps it when showEmptyLanes is set", () => {
        const entries = [entry("a", { axis: "used" })];
        const withoutEmpty = groupCalendarEntries(entries, ["axis"], { laneOrder: ["used", "unused"] });
        expect(withoutEmpty.map((l) => l.value)).toEqual(["used"]);

        const withEmpty = groupCalendarEntries(entries, ["axis"], {
            laneOrder: ["used", "unused"],
            showEmptyLanes: true,
        });
        expect(withEmpty.map((l) => l.value)).toEqual(["used", "unused"]);
        expect(withEmpty.find((l) => l.value === "unused")?.entries).toEqual([]);
    });

    it("nests a second grouping axis under the first, collapsing to leaf entries", () => {
        const entries = [
            entry("a", { kind: "item", tags: JSON.stringify(["work"]) }),
            entry("b", { kind: "item", tags: JSON.stringify(["urgent"]) }),
            entry("c", { kind: "table", tags: JSON.stringify(["work"]) }),
        ];
        const lanes = groupCalendarEntries(entries, ["kind", "tags"]);
        const item = lanes.find((l) => l.value === "item")!;
        expect(item.entries).toEqual([]);
        expect(item.children?.map((c) => c.value)).toEqual(["urgent", "work"]);
        expect(item.children?.find((c) => c.value === "work")?.entries.map((e) => e.key)).toEqual(["a"]);

        expect(flattenLaneEntries(item).map((e) => e.key).sort()).toEqual(["a", "b"]);
    });

    it("treats a plain (non-JSON) string value as a single scalar lane", () => {
        const entries = [entry("a", { source_kind: "item" })];
        const lanes = groupCalendarEntries(entries, ["source_kind"]);
        expect(lanes.map((l) => l.value)).toEqual(["item"]);
    });
});

describe("entryAxisValues", () => {
    it("returns [undefined] for a null/missing/blank value", () => {
        expect(entryAxisValues(entry("a", {}), "tags")).toEqual([undefined]);
        expect(entryAxisValues(entry("a", { tags: null }), "tags")).toEqual([undefined]);
        expect(entryAxisValues(entry("a", { tags: "   " }), "tags")).toEqual([undefined]);
    });

    it("dedupes a JSON array's values", () => {
        expect(entryAxisValues(entry("a", { tags: JSON.stringify(["x", "x", "y"]) }), "tags")).toEqual(["x", "y"]);
    });

    it("falls back to the raw text when it looks like an array but is not valid JSON", () => {
        expect(entryAxisValues(entry("a", { tags: "[not json" }), "tags")).toEqual(["[not json"]);
    });

    it("stringifies a numeric or boolean scalar", () => {
        expect(entryAxisValues(entry("a", { done: true }), "done")).toEqual(["true"]);
        expect(entryAxisValues(entry("a", { priority: 3 }), "priority")).toEqual(["3"]);
    });
});

describe("collapseLanePath", () => {
    it("joins a path into one label, rendering a NULL segment as (none)", () => {
        expect(collapseLanePath(["item", "work"])).toBe("item / work");
        expect(collapseLanePath(["item", undefined])).toBe("item / (none)");
        expect(collapseLanePath([])).toBe("");
    });
});
