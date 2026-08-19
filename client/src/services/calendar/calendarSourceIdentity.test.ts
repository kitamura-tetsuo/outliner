import { describe, expect, it } from "vitest";
import { isOutlineItemSourceKind, resolveOutlineItemId } from "./calendarSourceIdentity";

describe("isOutlineItemSourceKind", () => {
    it("accepts the reserved relation name and the aliases shipped queries use", () => {
        expect(isOutlineItemSourceKind("outline_items")).toBe(true);
        expect(isOutlineItemSourceKind("items")).toBe(true);
        expect(isOutlineItemSourceKind("item")).toBe(true);
    });

    it("rejects a table's own source kind and an absent one", () => {
        expect(isOutlineItemSourceKind("tasks")).toBe(false);
        expect(isOutlineItemSourceKind(undefined)).toBe(false);
    });
});

describe("resolveOutlineItemId", () => {
    const hasItem = (id: string) => id === "node-1";

    it("resolves by tree membership, whatever the query aliased source_kind to", () => {
        expect(resolveOutlineItemId({ sourceKind: "item", sourceId: "node-1" }, hasItem)).toBe("node-1");
        expect(resolveOutlineItemId({ sourceKind: "anything_at_all", sourceId: "node-1" }, hasItem)).toBe("node-1");
    });

    it("rejects a source id the outline tree does not know", () => {
        expect(resolveOutlineItemId({ sourceKind: "outline_items", sourceId: "row-9" }, hasItem)).toBeUndefined();
    });

    it("falls back to the source kind when no tree is available", () => {
        expect(resolveOutlineItemId({ sourceKind: "outline_items", sourceId: "row-9" })).toBe("row-9");
        expect(resolveOutlineItemId({ sourceKind: "tasks", sourceId: "row-9" })).toBeUndefined();
    });

    it("rejects a row with no addressable source at all", () => {
        expect(resolveOutlineItemId({ sourceKind: "outline_items", sourceId: undefined }, hasItem)).toBeUndefined();
    });
});
