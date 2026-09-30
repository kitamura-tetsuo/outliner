import { describe, expect, it } from "vitest";
import { shouldYieldToNativeContextMenu } from "./nativeContextMenu";

describe("shouldYieldToNativeContextMenu", () => {
    it("yields for Shift+secondary-button regardless of extra modifiers", () => {
        expect(shouldYieldToNativeContextMenu({ button: 2, shiftKey: true })).toBe(true);
    });

    it("does not yield for an unmodified right-click", () => {
        expect(shouldYieldToNativeContextMenu({ button: 2, shiftKey: false })).toBe(false);
    });

    it("does not yield for Shift+primary-button selection", () => {
        expect(shouldYieldToNativeContextMenu({ button: 0, shiftKey: true })).toBe(false);
    });

    it("does not yield for a middle-button click with Shift", () => {
        expect(shouldYieldToNativeContextMenu({ button: 1, shiftKey: true })).toBe(false);
    });

    it("does not yield for keyboard activation, which carries no button", () => {
        expect(shouldYieldToNativeContextMenu({ shiftKey: true })).toBe(false);
        expect(shouldYieldToNativeContextMenu({ shiftKey: false })).toBe(false);
    });
});
