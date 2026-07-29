import { Items, Project } from "$shared/app-schema";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import { createRecurrenceOverride } from "../../services/calendar/recurrenceEditing";
import { expandItemOccurrences } from "../../services/yjstable/recurrenceExpansion";
import type { RelationProvider, RelationWrite } from "../../services/yjstable/relationProvider";
import { TABLE_RELATION_CAPABILITIES } from "../../services/yjstable/relationProvider";
import CalendarDeleteEntryDialog from "./CalendarDeleteEntryDialog.svelte";

class RecordingProvider implements RelationProvider {
    readonly sqlName = "item";
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

function resolverFor(provider: RelationProvider) {
    return { resolveRelation: async () => provider };
}

function makeEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
    return {
        key: "item:row-1",
        sourceKind: "item",
        sourceId: "row-1",
        title: "Standup",
        raw: {},
        ...overrides,
    };
}

describe("CalendarDeleteEntryDialog", () => {
    it("offers Clear date only and Delete item for a plain entry, no occurrence option", () => {
        const provider = new RecordingProvider();
        const { getByTestId, queryByTestId } = render(CalendarDeleteEntryDialog, {
            props: {
                project: Project.createInstance("Test"),
                resolver: resolverFor(provider),
                entry: makeEntry(),
                onDeleted: () => {},
                onCancel: () => {},
            },
        });

        expect(getByTestId("calendar-delete-clear-field")).toBeTruthy();
        expect(getByTestId("calendar-delete-source")).toBeTruthy();
        expect(queryByTestId("calendar-delete-occurrence")).toBeNull();
    });

    it("clicking Delete item dispatches delete-source and calls onDeleted", async () => {
        const provider = new RecordingProvider();
        let deleted = false;
        const { getByTestId } = render(CalendarDeleteEntryDialog, {
            props: {
                project: Project.createInstance("Test"),
                resolver: resolverFor(provider),
                entry: makeEntry(),
                onDeleted: () => {
                    deleted = true;
                },
                onCancel: () => {},
            },
        });

        await fireEvent.click(getByTestId("calendar-delete-source"));
        await waitFor(() => expect(deleted).toBe(true));
        expect(provider.writes).toEqual([{ op: "DELETE", rowId: "row-1", disposition: "delete-source" }]);
    });

    it("clicking Clear date only dispatches clear-projected-field", async () => {
        const provider = new RecordingProvider();
        let deleted = false;
        const { getByTestId } = render(CalendarDeleteEntryDialog, {
            props: {
                project: Project.createInstance("Test"),
                resolver: resolverFor(provider),
                entry: makeEntry(),
                onDeleted: () => {
                    deleted = true;
                },
                onCancel: () => {},
            },
        });

        await fireEvent.click(getByTestId("calendar-delete-clear-field"));
        await waitFor(() => expect(deleted).toBe(true));
        expect(provider.writes).toEqual([{ op: "DELETE", rowId: "row-1", disposition: "clear-projected-field" }]);
    });

    it("cancelling calls onCancel without any write", async () => {
        const provider = new RecordingProvider();
        let cancelled = false;
        const { getByTestId } = render(CalendarDeleteEntryDialog, {
            props: {
                project: Project.createInstance("Test"),
                resolver: resolverFor(provider),
                entry: makeEntry(),
                onDeleted: () => {},
                onCancel: () => {
                    cancelled = true;
                },
            },
        });

        await fireEvent.click(getByTestId("calendar-delete-cancel"));
        expect(cancelled).toBe(true);
        expect(provider.writes).toHaveLength(0);
    });

    it("surfaces a write error rather than closing silently", async () => {
        class FailingProvider extends RecordingProvider {
            async applyWrite(): Promise<void> {
                throw new Error("boom");
            }
        }
        const provider = new FailingProvider();
        let deleted = false;
        const { getByTestId } = render(CalendarDeleteEntryDialog, {
            props: {
                project: Project.createInstance("Test"),
                resolver: resolverFor(provider),
                entry: makeEntry(),
                onDeleted: () => {
                    deleted = true;
                },
                onCancel: () => {},
            },
        });

        await fireEvent.click(getByTestId("calendar-delete-source"));
        await waitFor(() => expect(getByTestId("calendar-delete-error")).toBeTruthy());
        expect(deleted).toBe(false);
    });

    it("offers only 'Delete this occurrence' for a materialized recurrence override, and it records the exception", async () => {
        const project = Project.createInstance("Test");
        const page = new Items(project.ydoc, project.tree, "root").addNode("tester");
        const items = new Items(project.ydoc, project.tree, page.key);
        const source = items.addNode("tester");
        source.text = "Standup";
        source.rrule = "FREQ=WEEKLY;BYDAY=MO";
        source.recurrenceDtstart = "2026-08-03T09:00:00";
        source.recurrenceTimezone = "UTC";
        const rangeStart = Date.parse("2026-08-01T00:00:00Z");
        const rangeEnd = Date.parse("2026-08-31T00:00:00Z");
        const [occurrence] = expandItemOccurrences(source, rangeStart, rangeEnd);
        const override = createRecurrenceOverride(project.tree, source, occurrence);

        const entry = makeEntry({
            key: `item:${override.key}`,
            sourceId: override.key,
            recurrenceParentId: override.recurrenceParentId,
            recurrenceOccurrenceId: override.recurrenceOccurrenceId,
        });

        const provider = new RecordingProvider();
        let deleted = false;
        const { getByTestId, queryByTestId } = render(CalendarDeleteEntryDialog, {
            props: {
                project,
                resolver: resolverFor(provider),
                entry,
                onDeleted: () => {
                    deleted = true;
                },
                onCancel: () => {},
            },
        });

        expect(queryByTestId("calendar-delete-source")).toBeNull();
        expect(queryByTestId("calendar-delete-clear-field")).toBeNull();
        await fireEvent.click(getByTestId("calendar-delete-occurrence"));

        await waitFor(() => expect(deleted).toBe(true));
        expect(source.recurrenceExdate).toContain(occurrence.occurrenceId);
        expect([...items].some((i) => i.key === override.key)).toBe(false);
        // The generic relation path was never used for this outcome.
        expect(provider.writes).toHaveLength(0);
    });
});
