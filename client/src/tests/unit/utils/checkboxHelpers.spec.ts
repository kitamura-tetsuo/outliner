import { describe, expect, it, vi } from "vitest";
import type { Item } from "../../../schema/app-schema";
import { updateParentCheckboxStatus } from "../../../utils/checkboxHelpers";

describe("checkboxHelpers - updateParentCheckboxStatus", () => {
    it("should do nothing if parentItem is undefined", () => {
        expect(() => updateParentCheckboxStatus(undefined as unknown as Item)).not.toThrow();
    });

    it("should do nothing if parentText does not start with [ ] or [x] ", () => {
        const updateText = vi.fn();
        const parentItem = {
            text: "No checkbox",
            updateText,
            items: [],
        } as unknown as Item;
        updateParentCheckboxStatus(parentItem);
        expect(updateText).not.toHaveBeenCalled();
    });

    it("should update parent to [x] if all children with checkboxes are checked", () => {
        const updateText = vi.fn();
        const parentItem = {
            text: "[ ] Parent",
            updateText,
            items: [
                { text: "[x] Child 1" },
                { text: "No checkbox child" },
                { text: "[x] Child 2" },
            ],
        } as unknown as Item;
        updateParentCheckboxStatus(parentItem);
        expect(updateText).toHaveBeenCalledWith("[x] Parent");
    });

    it("should update parent to [ ] if not all children are checked", () => {
        const updateText = vi.fn();
        const parentItem = {
            text: "[x] Parent",
            updateText,
            items: [
                { text: "[x] Child 1" },
                { text: "[ ] Child 2" },
            ],
        } as unknown as Item;
        updateParentCheckboxStatus(parentItem);
        expect(updateText).toHaveBeenCalledWith("[ ] Parent");
    });

    it("should use iterateUnordered if available", () => {
        const updateText = vi.fn();
        const parentItem = {
            text: "[ ] Parent",
            updateText,
            items: {
                iterateUnordered: () => [
                    { text: "[x] Child 1" },
                ],
            },
        } as unknown as Item;
        updateParentCheckboxStatus(parentItem);
        expect(updateText).toHaveBeenCalledWith("[x] Parent");
    });
});
