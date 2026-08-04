import { describe, expect, it, vi } from "vitest";
import { safeGetNodeParent } from "../../src/utils/treeUtils.js";

describe("safeGetNodeParent", () => {
    it("returns undefined if tree is undefined or null", () => {
        expect(safeGetNodeParent(undefined, "key1")).toBeUndefined();
        expect(safeGetNodeParent(null, "key1")).toBeUndefined();
    });

    it("returns undefined if key is undefined or null", () => {
        const tree = { getNodeParentFromKey: vi.fn() } as any;
        expect(safeGetNodeParent(tree, undefined)).toBeUndefined();
        expect(safeGetNodeParent(tree, null)).toBeUndefined();
    });

    it("returns undefined if key is 'root'", () => {
        const tree = { getNodeParentFromKey: vi.fn() } as any;
        expect(safeGetNodeParent(tree, "root")).toBeUndefined();
    });

    it("returns undefined if tree.getNodeParentFromKey is not a function", () => {
        const tree = { getNodeParentFromKey: "not-a-function" } as any;
        expect(safeGetNodeParent(tree, "key1")).toBeUndefined();
    });

    it("returns the parent key from tree.getNodeParentFromKey", () => {
        const tree = { getNodeParentFromKey: vi.fn().mockReturnValue("parent1") } as any;
        expect(safeGetNodeParent(tree, "key1")).toBe("parent1");
        expect(tree.getNodeParentFromKey).toHaveBeenCalledWith("key1");
    });

    it("returns undefined if tree.getNodeParentFromKey returns falsy", () => {
        const tree = { getNodeParentFromKey: vi.fn().mockReturnValue(null) } as any;
        expect(safeGetNodeParent(tree, "key1")).toBeUndefined();
    });

    it("returns undefined if tree.getNodeParentFromKey throws an error", () => {
        const tree = {
            getNodeParentFromKey: vi.fn().mockImplementation(() => {
                throw new Error("error");
            }),
        } as any;
        expect(safeGetNodeParent(tree, "key1")).toBeUndefined();
    });
});
