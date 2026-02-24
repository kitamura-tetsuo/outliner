import { describe, it, expect, beforeEach } from "vitest";
import { CustomKeyMap, CustomKeySvelteMap } from "./CustomKeyMap";

describe("CustomKeyMap", () => {
    interface Key { id: string; }
    let map: CustomKeyMap<Key, string>;
    const keyFunc = (k: Key) => k.id;

    beforeEach(() => {
        map = new CustomKeyMap<Key, string>(keyFunc);
    });

    it("should set and get values", () => {
        map.set({ id: "a" }, "val1");
        expect(map.get({ id: "a" })).toBe("val1");
    });

    it("should handle different object references with same key", () => {
        map.set({ id: "a" }, "val1");
        expect(map.get({ id: "a" })).toBe("val1");
    });

    it("should check for existence", () => {
        map.set({ id: "a" }, "val1");
        expect(map.has({ id: "a" })).toBe(true);
        expect(map.has({ id: "b" })).toBe(false);
    });

    it("should delete values", () => {
        map.set({ id: "a" }, "val1");
        expect(map.delete({ id: "a" })).toBe(true);
        expect(map.has({ id: "a" })).toBe(false);
        expect(map.delete({ id: "a" })).toBe(false);
    });

    it("should return size", () => {
        expect(map.size).toBe(0);
        map.set({ id: "a" }, "1");
        map.set({ id: "b" }, "2");
        expect(map.size).toBe(2);
    });

    it("should clear values", () => {
        map.set({ id: "a" }, "1");
        map.clear();
        expect(map.size).toBe(0);
    });

    it("should get key at index", () => {
        map.set({ id: "a" }, "1");
        map.set({ id: "b" }, "2");
        expect(map.getKeyAtIndex(0)).toEqual({ id: "a" });
        expect(map.getKeyAtIndex(1)).toEqual({ id: "b" });
    });

    it("should get all keys", () => {
        map.set({ id: "a" }, "1");
        map.set({ id: "b" }, "2");
        expect(map.getAllKeys()).toEqual([{ id: "a" }, { id: "b" }]);
    });

    it("should get all values", () => {
        map.set({ id: "a" }, "1");
        map.set({ id: "b" }, "2");
        expect(map.getAllValues()).toEqual(["1", "2"]);
    });

    it("should get entries", () => {
        map.set({ id: "a" }, "1");
        expect(map.getEntries()).toEqual([[{ id: "a" }, "1"]]);
    });
});

describe("CustomKeySvelteMap", () => {
    it("should behave like a map", () => {
        const map = new CustomKeySvelteMap<{id: string}, string>(k => k.id);
        map.set({ id: "1" }, "one");
        expect(map.get({ id: "1" })).toBe("one");
        expect(map.size).toBe(1);
    });
});
