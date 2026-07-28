import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Item, PlainItemData } from "../../src/app-schema";

describe("Item recurrence", () => {
    it("returns undefined for rrule, recurrenceDtstart and recurrenceTimezone when absent", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        expect(item.rrule).toBeUndefined();
        expect(item.recurrenceDtstart).toBeUndefined();
        expect(item.recurrenceTimezone).toBeUndefined();
        expect(item.recurrenceExdate).toEqual([]);
    });

    it("can read and write rrule, recurrenceDtstart and recurrenceTimezone", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.rrule = "FREQ=WEEKLY;BYDAY=MO";
        item.recurrenceDtstart = "2026-08-03T09:00:00";
        item.recurrenceTimezone = "America/New_York";

        expect(item.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
        expect(item.recurrenceDtstart).toBe("2026-08-03T09:00:00");
        expect(item.recurrenceTimezone).toBe("America/New_York");

        item.rrule = undefined;
        expect(item.rrule).toBeUndefined();
    });

    it("adds and removes individual excluded occurrences", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.rrule = "FREQ=DAILY";
        item.addRecurrenceExdate("2026-08-04T09:00:00");
        item.addRecurrenceExdate("2026-08-05T09:00:00");
        expect(item.recurrenceExdate).toEqual(["2026-08-04T09:00:00", "2026-08-05T09:00:00"]);

        item.removeRecurrenceExdate("2026-08-04T09:00:00");
        expect(item.recurrenceExdate).toEqual(["2026-08-05T09:00:00"]);
    });

    it("ignores a blank occurrence id and does not add duplicates", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.rrule = "FREQ=DAILY";
        item.addRecurrenceExdate("2026-08-04T09:00:00");
        item.addRecurrenceExdate("2026-08-04T09:00:00");
        item.addRecurrenceExdate("   ");
        expect(item.recurrenceExdate).toEqual(["2026-08-04T09:00:00"]);
    });

    it("can read and write the override-only fields", () => {
        const item = new Item({ id: "override" } as PlainItemData);
        expect(item.recurrenceParentId).toBeUndefined();
        expect(item.recurrenceOccurrenceId).toBeUndefined();

        item.recurrenceParentId = "recurring-item-key";
        item.recurrenceOccurrenceId = "2026-08-10T09:00:00";
        expect(item.recurrenceParentId).toBe("recurring-item-key");
        expect(item.recurrenceOccurrenceId).toBe("2026-08-10T09:00:00");

        item.recurrenceParentId = undefined;
        expect(item.recurrenceParentId).toBeUndefined();
    });

    it("merges concurrent exception additions from two clients", () => {
        const originalItem = new Item({ id: "test-item" } as PlainItemData);
        originalItem.rrule = "FREQ=DAILY";

        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();
        const update = Y.encodeStateAsUpdate(originalItem.ydoc);
        Y.applyUpdate(doc1, update);
        Y.applyUpdate(doc2, update);

        const tree1 = new YTree(doc1.getMap("orderedTree"));
        const i1 = new Item(doc1, tree1, originalItem.key);

        const tree2 = new YTree(doc2.getMap("orderedTree"));
        const i2 = new Item(doc2, tree2, originalItem.key);

        // Concurrent, unsynchronized edits from two clients — each cancels a
        // different occurrence of the same recurring item.
        i1.addRecurrenceExdate("2026-08-04T09:00:00");
        i2.addRecurrenceExdate("2026-08-05T09:00:00");

        const u1 = Y.encodeStateAsUpdate(doc1);
        const u2 = Y.encodeStateAsUpdate(doc2);
        Y.applyUpdate(doc2, u1);
        Y.applyUpdate(doc1, u2);

        expect(new Set(i1.recurrenceExdate)).toEqual(
            new Set(["2026-08-04T09:00:00", "2026-08-05T09:00:00"]),
        );
        expect(new Set(i2.recurrenceExdate)).toEqual(
            new Set(["2026-08-04T09:00:00", "2026-08-05T09:00:00"]),
        );
    });
});
