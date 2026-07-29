import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { expandItemOccurrences } from "../yjstable/recurrenceExpansion";
import type { RelationProvider, RelationWrite } from "../yjstable/relationProvider";
import { TABLE_RELATION_CAPABILITIES } from "../yjstable/relationProvider";
import {
    deleteCalendarEntry,
    deleteCalendarRecurrenceOccurrence,
    isRecurrenceOverrideEntry,
} from "./calendarEntryDelete";
import { createRecurrenceOverride } from "./recurrenceEditing";

class RecordingProvider implements RelationProvider {
    readonly sqlName = "outline_items";
    readonly capabilities = TABLE_RELATION_CAPABILITIES;
    writes: RelationWrite[] = [];
    async materialize() {
        return true;
    }
    async applyWrite(write: RelationWrite) {
        this.writes.push(write);
    }
    dispose() {}
}

function resolverFor(provider: RelationProvider, name: string) {
    return { resolveRelation: async (sqlName: string) => sqlName === name ? provider : undefined };
}

describe("isRecurrenceOverrideEntry", () => {
    it("is true only when both recurrence fields are present", () => {
        expect(isRecurrenceOverrideEntry({ recurrenceParentId: "p", recurrenceOccurrenceId: "o" })).toBe(true);
        expect(isRecurrenceOverrideEntry({ recurrenceParentId: "p", recurrenceOccurrenceId: undefined })).toBe(false);
        expect(isRecurrenceOverrideEntry({ recurrenceParentId: undefined, recurrenceOccurrenceId: "o" })).toBe(false);
        expect(isRecurrenceOverrideEntry({})).toBe(false);
    });
});

describe("deleteCalendarEntry", () => {
    it("dispatches delete-source through the entry's relation", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await deleteCalendarEntry(resolver, { sourceKind: "item", sourceId: "42" }, "delete-source");
        expect(provider.writes).toEqual([{ op: "DELETE", rowId: "42", disposition: "delete-source" }]);
    });

    it("dispatches clear-projected-field through the entry's relation", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await deleteCalendarEntry(resolver, { sourceKind: "item", sourceId: "42" }, "clear-projected-field");
        expect(provider.writes).toEqual([{ op: "DELETE", rowId: "42", disposition: "clear-projected-field" }]);
    });

    it("throws rather than deleting when the entry has no source origin", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await expect(deleteCalendarEntry(resolver, {}, "delete-source")).rejects.toThrow(/writable origin/);
        expect(provider.writes).toHaveLength(0);
    });
});

const RANGE_START = Date.parse("2026-08-01T00:00:00Z");
const RANGE_END = Date.parse("2026-08-31T00:00:00Z");

let projectCounter = 0;

function makeRecurringProject() {
    const projectDoc = new Y.Doc({ guid: `calendar-entry-delete-${projectCounter++}` });
    const project = Project.fromDoc(projectDoc);
    const page = new Items(projectDoc, project.tree, "root").addNode("tester");
    const items = new Items(projectDoc, project.tree, page.key);

    const source = items.addNode("tester");
    source.text = "Standup";
    source.rrule = "FREQ=WEEKLY;BYDAY=MO";
    source.recurrenceDtstart = "2026-08-03T09:00:00";
    source.recurrenceTimezone = "UTC";

    return { projectDoc, project, items, source };
}

describe("deleteCalendarRecurrenceOccurrence", () => {
    it("records an exception on the source and removes the override, leaving other occurrences alone", () => {
        const { project, items, source } = makeRecurringProject();
        const occurrences = expandItemOccurrences(source, RANGE_START, RANGE_END);
        expect(occurrences.length).toBeGreaterThanOrEqual(2);
        const override = createRecurrenceOverride(project.tree, source, occurrences[0]);

        deleteCalendarRecurrenceOccurrence(project, {
            sourceId: override.key,
            recurrenceParentId: override.recurrenceParentId,
            recurrenceOccurrenceId: override.recurrenceOccurrenceId,
        });

        // The override is gone...
        expect([...items].some((i) => i.key === override.key)).toBe(false);
        // ...the rule itself is untouched...
        expect(source.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
        // ...but the exception is recorded, so this occurrence no longer expands.
        expect(source.recurrenceExdate).toContain(occurrences[0].occurrenceId);
        const remaining = expandItemOccurrences(source, RANGE_START, RANGE_END);
        expect(remaining.length).toBe(occurrences.length - 1);
    });

    it("throws when the entry is not a materialized override", () => {
        const { project } = makeRecurringProject();
        expect(() =>
            deleteCalendarRecurrenceOccurrence(project, {
                sourceId: "some-key",
                recurrenceParentId: undefined,
                recurrenceOccurrenceId: undefined,
            })
        ).toThrow(/not a materialized recurrence override/);
    });

    it("throws when the source recurring item no longer exists", () => {
        const { project } = makeRecurringProject();
        expect(() =>
            deleteCalendarRecurrenceOccurrence(project, {
                sourceId: "override-key",
                recurrenceParentId: "no-such-item-id",
                recurrenceOccurrenceId: "2026-08-03T09:00:00",
            })
        ).toThrow(/no longer exists/);
    });
});
