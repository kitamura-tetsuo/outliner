import { describe, expect, it } from "vitest";
import { CustomKeySvelteMap } from "./CustomKeyMap";

describe("CustomKeySvelteMap", () => {
    it("should behave like a map", () => {
        const map = new CustomKeySvelteMap<{ id: string; }, string>(k => k.id);
        map.set({ id: "1" }, "one");
        expect(map.get({ id: "1" })).toBe("one");
        expect(map.size).toBe(1);
    });
});
