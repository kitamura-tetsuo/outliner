import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { expandItemOccurrences, expandItemOccurrencesWithOverrides } from "../yjstable/recurrenceExpansion";
import { createRecurrenceOverride, deleteOccurrence } from "./recurrenceEditing";

let counter = 0;

function makeProject() {
    const projectDoc = new Y.Doc({ guid: `recurrence-editing-override-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const page = new Items(projectDoc, tree, "root").addNode("tester");
    const items = new Items(projectDoc, tree, page.key);

    const source = items.addNode("tester");
    source.text = "Standup";
    source.rrule = "FREQ=WEEKLY;BYDAY=MO";
    source.recurrenceDtstart = "2026-08-03T09:00:00";
    source.recurrenceTimezone = "UTC";

    return { projectDoc, tree, items, source };
}

const RANGE_START = Date.parse("2026-08-01T00:00:00Z");
const RANGE_END = Date.parse("2026-08-31T00:00:00Z");

describe("createRecurrenceOverride", () => {
    it("becomes an ordinary item the moment the occurrence is edited", () => {
        const { tree, items, source } = makeProject();
        const [occurrence] = expandItemOccurrences(source, RANGE_START, RANGE_END);

        const override = createRecurrenceOverride(tree, source, occurrence, { text: "Standup (retro)" });

        expect(override.text).toBe("Standup (retro)");
        expect(override.recurrenceParentId).toBe(source.id);
        expect(override.recurrenceOccurrenceId).toBe(occurrence.occurrenceId);
        // An ordinary item from here: draggable/editable through its own fields.
        expect(override.start).toBe("2026-08-03T09:00:00Z");
        expect(override.allDay).toBe(false);

        // It is a real sibling of `source`, reachable from `items` like any other.
        expect([...items].some((i) => i.key === override.key)).toBe(true);
    });

    it("defaults text/tags/allDay/duration from the source when not overridden", () => {
        const { tree, source } = makeProject();
        source.addTag("work");
        source.duration = "PT30M";
        const [occurrence] = expandItemOccurrences(source, RANGE_START, RANGE_END);

        const override = createRecurrenceOverride(tree, source, occurrence);

        expect(override.text).toBe("Standup");
        expect(override.tags).toEqual(["work"]);
        expect(override.duration).toBe("PT30M");
    });

    it("keeps the edited occurrence's change while its siblings do not carry it", () => {
        const { tree, source } = makeProject();
        const occurrences = expandItemOccurrences(source, RANGE_START, RANGE_END);
        expect(occurrences.length).toBeGreaterThan(1);

        createRecurrenceOverride(tree, source, occurrences[0], { text: "Standup (retro)" });

        // The recurring item's own rule is untouched: every other occurrence
        // still expands normally, with the original text.
        const stillVirtual = expandItemOccurrences(source, RANGE_START, RANGE_END);
        expect(stillVirtual).toHaveLength(occurrences.length);
    });

    it("is not double-rendered alongside its virtual counterpart", () => {
        const { tree, items, source } = makeProject();
        const occurrences = expandItemOccurrences(source, RANGE_START, RANGE_END);
        createRecurrenceOverride(tree, source, occurrences[1]);

        const merged = expandItemOccurrencesWithOverrides(source, items, RANGE_START, RANGE_END);
        expect(merged.map((o) => o.occurrenceId)).not.toContain(occurrences[1].occurrenceId);
        expect(merged).toHaveLength(occurrences.length - 1);
    });

    it("all-day occurrences get a floating-date start, not an instant", () => {
        const { tree, source } = makeProject();
        source.allDay = true;
        const [occurrence] = expandItemOccurrences(source, RANGE_START, RANGE_END);

        const override = createRecurrenceOverride(tree, source, occurrence);
        expect(override.start).toBe("2026-08-03");
        expect(override.allDay).toBe(true);
    });
});

describe("deleteOccurrence", () => {
    it("records an exception rather than removing the rule", () => {
        const { tree, source } = makeProject();
        const before = expandItemOccurrences(source, RANGE_START, RANGE_END);

        deleteOccurrence(tree, source, before[0].occurrenceId);

        expect(source.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
        const after = expandItemOccurrences(source, RANGE_START, RANGE_END);
        expect(after).toHaveLength(before.length - 1);
        expect(after.map((o) => o.occurrenceId)).not.toContain(before[0].occurrenceId);
    });

    it("also deletes the override when the cancelled occurrence had one, so it does not reappear", () => {
        const { tree, items, source } = makeProject();
        const [occurrence] = expandItemOccurrences(source, RANGE_START, RANGE_END);
        const override = createRecurrenceOverride(tree, source, occurrence, { text: "Moved" });

        deleteOccurrence(tree, source, occurrence.occurrenceId, override);

        expect([...items].some((i) => i.key === override.key)).toBe(false);
        const merged = expandItemOccurrencesWithOverrides(source, items, RANGE_START, RANGE_END);
        expect(merged.map((o) => o.occurrenceId)).not.toContain(occurrence.occurrenceId);
    });

    it("ignores an override for a different occurrence", () => {
        const { tree, items, source } = makeProject();
        const occurrences = expandItemOccurrences(source, RANGE_START, RANGE_END);
        const otherOverride = createRecurrenceOverride(tree, source, occurrences[1]);

        deleteOccurrence(tree, source, occurrences[0].occurrenceId, otherOverride);

        // `otherOverride` belongs to a different occurrence: it survives.
        expect([...items].some((i) => i.key === otherOverride.key)).toBe(true);
    });
});
