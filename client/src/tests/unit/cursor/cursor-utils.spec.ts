import { describe, expect, it } from "vitest";
import { isPageItem } from "../../../lib/cursor/CursorNavigationUtils";

describe("Cursor Utilities", () => {
    describe("isPageItem", () => {
        it("should return true for items with root parent", () => {
            const mockItem = {
                parent: {
                    parentKey: "root",
                },
            } as any;

            expect(isPageItem(mockItem)).toBe(true);
        });

        it("should return false for items without parent", () => {
            const mockItem = {
                parent: null,
            } as any;

            expect(isPageItem(mockItem)).toBe(false);
        });

        it("should return false for items with non-root parent", () => {
            const mockItem = {
                parent: {
                    parentKey: "some-other-key",
                },
            } as any;

            expect(isPageItem(mockItem)).toBe(false);
        });

        it("should return false for items with undefined parent", () => {
            const mockItem = {
                parent: undefined,
            } as any;

            expect(isPageItem(mockItem)).toBe(false);
        });
    });
});
