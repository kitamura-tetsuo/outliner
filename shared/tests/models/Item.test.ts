import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Item, PlainItemData } from "../../src/app-schema";

describe("Item Schedule Properties", () => {
    it("returns undefined for due and done when absent", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        expect(item.due).toBeUndefined();
        expect(item.done).toBeUndefined();
    });

    it("can read and write due property", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.due = "2023-12-01T12:00:00Z";
        expect(item.due).toBe("2023-12-01T12:00:00Z");

        item.due = undefined;
        expect(item.due).toBeUndefined();
    });

    it("can read and write done property", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.done = true;
        expect(item.done).toBe(true);

        item.done = false;
        expect(item.done).toBe(false);

        item.done = undefined;
        expect(item.done).toBeUndefined();
    });

    it("setting due does not modify the item's text", () => {
        const item = new Item({ id: "test", text: "Hello" } as PlainItemData);
        expect(item.text).toBe("Hello");
        item.due = "2023-12-01T12:00:00Z";
        expect(item.text).toBe("Hello");
    });
});
