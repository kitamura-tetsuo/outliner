import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { expandItemOccurrences, expandItemOccurrencesWithOverrides, isRecurring } from "./recurrenceExpansion";

let counter = 0;

function makeProject() {
    const projectDoc = new Y.Doc({ guid: `recurrence-expansion-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const page = new Items(projectDoc, tree, "root").addNode("tester");
    const items = new Items(projectDoc, tree, page.key);
    return { items };
}

const RANGE_START = Date.parse("2026-08-01T00:00:00Z");
const RANGE_END = Date.parse("2026-08-31T00:00:00Z");

describe("isRecurring", () => {
    it("is false until rrule, recurrenceDtstart and recurrenceTimezone are all set", () => {
        const { items } = makeProject();
        const item = items.addNode("tester");
        expect(isRecurring(item)).toBe(false);

        item.rrule = "FREQ=DAILY";
        expect(isRecurring(item)).toBe(false);

        item.recurrenceDtstart = "2026-08-03T09:00:00";
        expect(isRecurring(item)).toBe(false);

        item.recurrenceTimezone = "UTC";
        expect(isRecurring(item)).toBe(true);
    });
});

describe("expandItemOccurrences", () => {
    it("returns nothing for a non-recurring item", () => {
        const { items } = makeProject();
        const item = items.addNode("tester");
        expect(expandItemOccurrences(item, RANGE_START, RANGE_END)).toEqual([]);
    });

    it("tags every occurrence with the source item's id and tree key", () => {
        const { items } = makeProject();
        const item = items.addNode("tester");
        item.rrule = "FREQ=WEEKLY;BYDAY=MO";
        item.recurrenceDtstart = "2026-08-03T09:00:00";
        item.recurrenceTimezone = "UTC";

        const occurrences = expandItemOccurrences(item, RANGE_START, RANGE_END);
        expect(occurrences.length).toBeGreaterThan(0);
        for (const o of occurrences) {
            expect(o.sourceItemId).toBe(item.id);
            expect(o.sourceItemKey).toBe(item.key);
        }
    });

    it("reads the occurrence length from the item's own ISO-8601 duration", () => {
        const { items } = makeProject();
        const item = items.addNode("tester");
        item.rrule = "FREQ=WEEKLY;BYDAY=MO";
        item.recurrenceDtstart = "2026-08-03T09:00:00";
        item.recurrenceTimezone = "UTC";
        item.duration = "PT1H";

        const [occurrence] = expandItemOccurrences(item, RANGE_START, RANGE_END);
        expect(occurrence.endUtcMs - occurrence.startUtcMs).toBe(60 * 60 * 1000);
    });
});

describe("expandItemOccurrencesWithOverrides", () => {
    it("excludes only occurrences a sibling override replaces", () => {
        const { items } = makeProject();
        const item = items.addNode("tester");
        item.rrule = "FREQ=WEEKLY;BYDAY=MO";
        item.recurrenceDtstart = "2026-08-03T09:00:00";
        item.recurrenceTimezone = "UTC";

        const unrelated = items.addNode("tester");
        unrelated.recurrenceParentId = "some-other-item";
        unrelated.recurrenceOccurrenceId = "2026-08-03T09:00:00";

        const override = items.addNode("tester");
        override.recurrenceParentId = item.id;
        override.recurrenceOccurrenceId = "2026-08-10T09:00:00";

        const merged = expandItemOccurrencesWithOverrides(item, items, RANGE_START, RANGE_END);
        expect(merged.map((o) => o.occurrenceId)).not.toContain("2026-08-10T09:00:00");
        expect(merged.map((o) => o.occurrenceId)).toContain("2026-08-03T09:00:00");
    });
});
