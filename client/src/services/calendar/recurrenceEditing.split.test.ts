import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { expandItemOccurrences } from "../yjstable/recurrenceExpansion";
import { splitRecurrenceAtOccurrence } from "./recurrenceEditing";

let counter = 0;

function makeProject() {
    const projectDoc = new Y.Doc({ guid: `recurrence-editing-split-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const page = new Items(projectDoc, tree, "root").addNode("tester");
    const items = new Items(projectDoc, tree, page.key);

    const source = items.addNode("tester");
    source.text = "Standup";
    source.rrule = "FREQ=WEEKLY;BYDAY=MO";
    source.recurrenceDtstart = "2026-08-03T09:00:00"; // a Monday
    source.recurrenceTimezone = "UTC";

    return { projectDoc, tree, items, source };
}

const RANGE_START = Date.parse("2026-08-01T00:00:00Z");
const RANGE_END = Date.parse("2026-10-31T00:00:00Z");

describe("splitRecurrenceAtOccurrence — this and following", () => {
    it("truncates the original rule and starts a new item from the split point", () => {
        const { tree, source } = makeProject();
        // Occurrences: 08-03, 08-10, 08-17, 08-24, ... — split at 08-17.
        const next = splitRecurrenceAtOccurrence(tree, source, "2026-08-17T09:00:00", {
            text: "Standup (new time)",
        });

        expect(next).not.toBe(source);
        expect(next.text).toBe("Standup (new time)");
        expect(next.recurrenceDtstart).toBe("2026-08-17T09:00:00");
        expect(next.recurrenceTimezone).toBe("UTC");
        // Dtstart lives only in `recurrenceDtstart`: a serialized rule that
        // also embedded a `DTSTART:` line would silently disagree with it
        // (and, worse, disagree with `source.recurrenceDtstart` too, since
        // rrule's own serialization would carry the *original* series'
        // dtstart forward onto both halves of the split).
        expect(source.rrule).not.toMatch(/DTSTART/);
        expect(next.rrule).not.toMatch(/DTSTART/);

        const originalOccurrences = expandItemOccurrences(source, RANGE_START, RANGE_END);
        const continuationOccurrences = expandItemOccurrences(next, RANGE_START, RANGE_END);

        expect(originalOccurrences.map((o) => o.occurrenceId)).toEqual([
            "2026-08-03T09:00:00",
            "2026-08-10T09:00:00",
        ]);
        expect(continuationOccurrences[0].occurrenceId).toBe("2026-08-17T09:00:00");
        expect(continuationOccurrences.map((o) => o.occurrenceId)).not.toContain("2026-08-10T09:00:00");
    });

    it("carries over the remaining COUNT rather than restarting it", () => {
        const { tree, source } = makeProject();
        source.rrule = "FREQ=WEEKLY;BYDAY=MO;COUNT=5";
        // Occurrences 1-5: 08-03, 08-10, 08-17, 08-24, 08-31. Split at #3 (08-17).
        const next = splitRecurrenceAtOccurrence(tree, source, "2026-08-17T09:00:00");

        const originalOccurrences = expandItemOccurrences(source, RANGE_START, RANGE_END);
        const continuationOccurrences = expandItemOccurrences(next, RANGE_START, RANGE_END);

        // 2 kept before the split, 3 remaining from the split onward — not 5 more.
        expect(originalOccurrences).toHaveLength(2);
        expect(continuationOccurrences).toHaveLength(3);
    });

    it("degenerates to editing in place when the occurrence is the series' own first", () => {
        const { tree, source } = makeProject();
        const result = splitRecurrenceAtOccurrence(tree, source, "2026-08-03T09:00:00", {
            text: "Renamed",
        });

        expect(result).toBe(source);
        expect(source.text).toBe("Renamed");
    });

    it("migrates exceptions at/after the split point to the continuation", () => {
        const { tree, source } = makeProject();
        source.addRecurrenceExdate("2026-08-10T09:00:00"); // before the split
        source.addRecurrenceExdate("2026-08-24T09:00:00"); // at/after the split

        const next = splitRecurrenceAtOccurrence(tree, source, "2026-08-17T09:00:00");

        expect(source.recurrenceExdate).toEqual(["2026-08-10T09:00:00"]);
        expect(next.recurrenceExdate).toEqual(["2026-08-24T09:00:00"]);
    });
});

describe("splitRecurrenceAtOccurrence — all events", () => {
    it("needs no dedicated function: editing the recurring item's own fields applies to every occurrence", () => {
        const { source } = makeProject();
        source.text = "Renamed for everyone";
        source.rrule = "FREQ=WEEKLY;BYDAY=TU";

        expect(source.text).toBe("Renamed for everyone");
        const occurrences = expandItemOccurrences(source, RANGE_START, RANGE_END);
        // Every generated occurrence now falls on the new weekday.
        for (const o of occurrences) {
            expect(new Date(o.startUtcMs).getUTCDay()).toBe(2); // Tuesday
        }
    });
});
