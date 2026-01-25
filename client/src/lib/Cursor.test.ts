import { describe, expect, it } from "vitest";
import { Cursor } from "./Cursor";

describe("Cursor", () => {
    it("should initialize correctly", () => {
        const cursor = new Cursor("user1", "User 1");
        expect(cursor.isActive).toBe(false);
        expect(cursor.position).toBeNull();
        expect(cursor.userId).toBe("user1");
    });

    it("should set position", () => {
        const cursor = new Cursor();
        cursor.setPosition("item1", 5);
        expect(cursor.isActive).toBe(true);
        expect(cursor.position).toEqual({ itemId: "item1", offset: 5 });
    });

    it("should clear position", () => {
        const cursor = new Cursor();
        cursor.setPosition("item1", 5);
        cursor.clear();
        expect(cursor.isActive).toBe(false);
        // Position remains but inactive
        expect(cursor.position).toEqual({ itemId: "item1", offset: 5 });
    });

    it("should move cursor", () => {
        const cursor = new Cursor();
        cursor.setPosition("item1", 5);

        // Mock getCurrentItemLength
        cursor["getCurrentItemLength"] = () => 10;

        cursor.move(2);
        expect(cursor.position?.offset).toBe(7);

        cursor.move(-3);
        expect(cursor.position?.offset).toBe(4);
    });

    it("should not move cursor out of bounds", () => {
        const cursor = new Cursor();
        cursor.setPosition("item1", 5);

        // Mock getCurrentItemLength
        cursor["getCurrentItemLength"] = () => 10;

        cursor.move(10); // > 10
        expect(cursor.position?.offset).toBe(10);

        cursor.move(-20); // < 0
        expect(cursor.position?.offset).toBe(0);
    });
});
