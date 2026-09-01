import { describe, expect, it, vi } from "vitest";
import { safeGetNodeParent } from "./treeUtils.js";
import type { YTree } from "yjs-orderedtree";

describe("treeUtils", () => {
  describe("safeGetNodeParent", () => {
    it("returns undefined if tree is null/undefined", () => {
      expect(safeGetNodeParent(undefined, "test-key")).toBeUndefined();
      expect(safeGetNodeParent(null, "test-key")).toBeUndefined();
    });

    it("returns undefined if key is null/undefined or root", () => {
      const tree = { getNodeParentFromKey: () => "parent" } as unknown as YTree;
      expect(safeGetNodeParent(tree, undefined)).toBeUndefined();
      expect(safeGetNodeParent(tree, null)).toBeUndefined();
      expect(safeGetNodeParent(tree, "root")).toBeUndefined();
      expect(safeGetNodeParent(tree, "")).toBeUndefined();
    });

    it("returns undefined if tree does not have getNodeParentFromKey method", () => {
      const tree = {} as unknown as YTree;
      expect(safeGetNodeParent(tree, "test-key")).toBeUndefined();
    });

    it("returns parent key successfully", () => {
      const tree = {
        getNodeParentFromKey: vi.fn().mockReturnValue("parent-key"),
      } as unknown as YTree;
      expect(safeGetNodeParent(tree, "test-key")).toBe("parent-key");
      expect(tree.getNodeParentFromKey).toHaveBeenCalledWith("test-key");
    });

    it("returns undefined if getNodeParentFromKey returns null", () => {
      const tree = {
        getNodeParentFromKey: vi.fn().mockReturnValue(null),
      } as unknown as YTree;
      expect(safeGetNodeParent(tree, "test-key")).toBeUndefined();
    });

    it("returns undefined if getNodeParentFromKey throws an error", () => {
      const tree = {
        getNodeParentFromKey: vi.fn().mockImplementation(() => {
          throw new Error("test error");
        }),
      } as unknown as YTree;
      expect(safeGetNodeParent(tree, "test-key")).toBeUndefined();
    });
  });
});
