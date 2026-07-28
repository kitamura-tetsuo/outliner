import { describe, expect, it } from "vitest";
import { Item, PlainItemData } from "../../src/app-schema";

describe("Item calendar time model", () => {
    it("returns undefined for allDay, start and duration when absent", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        expect(item.allDay).toBeUndefined();
        expect(item.start).toBeUndefined();
        expect(item.duration).toBeUndefined();
    });

    it("can read and write allDay", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.allDay = true;
        expect(item.allDay).toBe(true);

        item.allDay = false;
        expect(item.allDay).toBe(false);

        item.allDay = undefined;
        expect(item.allDay).toBeUndefined();
    });

    it("can read and write an all-day start as a floating date", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.allDay = true;
        item.start = "2026-08-01";
        expect(item.start).toBe("2026-08-01");
        expect(item.allDay).toBe(true);

        item.start = undefined;
        expect(item.start).toBeUndefined();
    });

    it("can read and write a timed start as an instant", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.allDay = false;
        item.start = "2026-08-01T09:00:00Z";
        expect(item.start).toBe("2026-08-01T09:00:00Z");
        expect(item.allDay).toBe(false);
    });

    it("can read and write duration as an ISO-8601 duration string", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.duration = "PT1H30M";
        expect(item.duration).toBe("PT1H30M");

        item.duration = undefined;
        expect(item.duration).toBeUndefined();
    });

    it("keeps due and start independent — setting one leaves the other untouched", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.due = "2026-08-07T00:00:00Z";
        item.allDay = true;
        item.start = "2026-08-05";
        expect(item.due).toBe("2026-08-07T00:00:00Z");
        expect(item.start).toBe("2026-08-05");

        item.start = undefined;
        expect(item.due).toBe("2026-08-07T00:00:00Z");

        item.due = undefined;
        // Clearing `due` must not clear `start`: they are stored independently.
        item.allDay = true;
        item.start = "2026-08-05";
        item.due = undefined;
        expect(item.start).toBe("2026-08-05");
    });

    it("setting allDay/start/duration does not modify the item's text", () => {
        const item = new Item({ id: "test", text: "Hello" } as PlainItemData);
        item.allDay = true;
        item.start = "2026-08-01";
        item.duration = "P1D";
        expect(item.text).toBe("Hello");
    });
});
