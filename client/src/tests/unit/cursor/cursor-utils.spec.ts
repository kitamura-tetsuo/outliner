import { describe, expect, it } from "vitest";
import { isPageItem } from "../../../lib/cursor/CursorNavigationUtils";
import type { Item } from "../../../schema/yjs-schema";

describe("Cursor Utilities", () => {
    describe("isPageItem", () => {
        it("should return true for items with root parent", () => {
            const mockItem = {
                parent: {
                    parentKey: "root",
                },
            } as Item;

            expect(isPageItem(mockItem)).toBe(true);
        });

        it("should return false for items without parent", () => {
            const mockItem = {
                parent: null,
            } as Item;

            expect(isPageItem(mockItem)).toBe(false);
        });

        it("should return false for items with non-root parent", () => {
            const mockItem = {
                parent: {
                    parentKey: "some-other-key",
                },
            } as Item;

            expect(isPageItem(mockItem)).toBe(false);
        });

        it("should return false for items with undefined parent", () => {
            const mockItem = {
                parent: undefined,
            } as Item;

            expect(isPageItem(mockItem)).toBe(false);
        });
    });
});
