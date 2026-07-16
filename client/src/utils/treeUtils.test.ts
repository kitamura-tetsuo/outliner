import { describe, expect, it, vi } from "vitest";
import type { YTree } from "yjs-orderedtree";
import { safeGetNodeParent } from "./treeUtils";

describe("treeUtils", () => {
    describe("safeGetNodeParent", () => {
        it("returns undefined if tree is null/undefined", () => {
            expect(safeGetNodeParent(null, "node1")).toBeUndefined();
            expect(safeGetNodeParent(undefined, "node1")).toBeUndefined();
        });

        it("returns undefined if key is null/undefined/root", () => {
            const mockTree = { getNodeParentFromKey: vi.fn() } as unknown as YTree;
            expect(safeGetNodeParent(mockTree, null)).toBeUndefined();
            expect(safeGetNodeParent(mockTree, undefined)).toBeUndefined();
            expect(safeGetNodeParent(mockTree, "root")).toBeUndefined();
        });

        it("returns undefined if tree does not have getNodeParentFromKey", () => {
            const mockTree = {} as unknown as YTree;
            expect(safeGetNodeParent(mockTree, "node1")).toBeUndefined();
        });

        it("returns parent id when getNodeParentFromKey succeeds", () => {
            const mockTree = {
                getNodeParentFromKey: vi.fn().mockReturnValue("parent-node"),
            } as unknown as YTree;
            expect(safeGetNodeParent(mockTree, "child-node")).toBe("parent-node");
            expect(mockTree.getNodeParentFromKey).toHaveBeenCalledWith("child-node");
        });

        it("returns undefined when getNodeParentFromKey throws an error", () => {
            const mockTree = {
                getNodeParentFromKey: vi.fn().mockImplementation(() => {
                    throw new Error("Test Error");
                }),
            } as unknown as YTree;
            expect(safeGetNodeParent(mockTree, "child-node")).toBeUndefined();
        });

        it("returns undefined when getNodeParentFromKey returns null or undefined", () => {
            const mockTree = {
                getNodeParentFromKey: vi.fn().mockReturnValue(null),
            } as unknown as YTree;
            expect(safeGetNodeParent(mockTree, "child-node")).toBeUndefined();

            const mockTree2 = {
                getNodeParentFromKey: vi.fn().mockReturnValue(undefined),
            } as unknown as YTree;
            expect(safeGetNodeParent(mockTree2, "child-node")).toBeUndefined();
        });
    });
});
