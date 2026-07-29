import { describe, expect, it } from "vitest";
import type { RelationProvider, RelationWrite } from "../yjstable/relationProvider";
import { TABLE_RELATION_CAPABILITIES } from "../yjstable/relationProvider";
import {
    resolveCalendarEntryWritability,
    writeCalendarEntryDuration,
    writeCalendarEntryStart,
} from "./calendarEntryWrite";

/** Minimal recording stub mirroring relationRowWrite.test.ts's `RecordingProvider`. */
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

describe("resolveCalendarEntryWritability", () => {
    const writableColumns = new Map([["start", "start_at"], ["duration", "duration"]]);

    it("is writable when the entry has an origin and the role resolves to a writable column", () => {
        const w = resolveCalendarEntryWritability(
            { sourceKind: "item", sourceId: "1" },
            { roleStart: "start", roleDuration: "duration" },
            writableColumns,
        );
        expect(w).toEqual({ startWritable: true, durationWritable: true });
    });

    it("is not writable when the entry has no source_kind/source_id", () => {
        const w = resolveCalendarEntryWritability(
            { sourceKind: undefined, sourceId: undefined },
            { roleStart: "start", roleDuration: "duration" },
            writableColumns,
        );
        expect(w).toEqual({ startWritable: false, durationWritable: false });
    });

    it("is not writable when the role points at a calculated (non-writable) column", () => {
        const w = resolveCalendarEntryWritability(
            { sourceKind: "item", sourceId: "1" },
            { roleStart: "bucket", roleDuration: "duration" },
            writableColumns,
        );
        expect(w.startWritable).toBe(false);
    });

    it("is not writable when no role is assigned", () => {
        const w = resolveCalendarEntryWritability(
            { sourceKind: "item", sourceId: "1" },
            {},
            writableColumns,
        );
        expect(w).toEqual({ startWritable: false, durationWritable: false });
    });
});

describe("writeCalendarEntryStart", () => {
    it("writes an ISO instant to the resolved column for a timed entry", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await writeCalendarEntryStart(
            resolver,
            { sourceKind: "item", sourceId: "42", allDay: false },
            "start_at",
            Date.parse("2026-03-16T09:30:00Z"),
            "UTC",
        );
        expect(provider.writes).toEqual([
            { op: "UPDATE", rowId: "42", column: "start_at", value: "2026-03-16T09:30:00.000Z" },
        ]);
    });

    it("writes a plain date to the resolved column for an all-day entry", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await writeCalendarEntryStart(
            resolver,
            { sourceKind: "item", sourceId: "42", allDay: true },
            "start_on",
            Date.parse("2026-08-01T00:00:00Z"),
            "UTC",
        );
        expect(provider.writes).toEqual([
            { op: "UPDATE", rowId: "42", column: "start_on", value: "2026-08-01" },
        ]);
    });

    // The inverse of `buildCalendarEntries`' floating-date read: dropping an
    // all-day entry on a day cell must store *that* day. Formatting the
    // instant as a UTC date instead stored the neighbouring day whenever the
    // calendar's zone had a non-zero offset.
    it("names the day in the calendar's zone when writing an all-day start", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await writeCalendarEntryStart(
            resolver,
            { sourceKind: "item", sourceId: "42", allDay: true },
            "start_on",
            // Midnight of 2026-08-01 in Asia/Tokyo.
            Date.parse("2026-07-31T15:00:00Z"),
            "Asia/Tokyo",
        );
        expect(provider.writes).toEqual([
            { op: "UPDATE", rowId: "42", column: "start_on", value: "2026-08-01" },
        ]);
    });

    it("throws rather than writing when the entry has no source origin", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await expect(
            writeCalendarEntryStart(resolver, { allDay: false }, "start_at", Date.now(), "UTC"),
        ).rejects.toThrow(/writable origin/);
        expect(provider.writes).toHaveLength(0);
    });
});

describe("writeCalendarEntryDuration", () => {
    it("writes the ISO 8601 duration to the resolved column", async () => {
        const provider = new RecordingProvider();
        const resolver = resolverFor(provider, "item");
        await writeCalendarEntryDuration(
            resolver,
            { sourceKind: "item", sourceId: "42" },
            "duration",
            90 * 60 * 1000,
        );
        expect(provider.writes).toEqual([
            { op: "UPDATE", rowId: "42", column: "duration", value: "PT1H30M" },
        ]);
    });
});
