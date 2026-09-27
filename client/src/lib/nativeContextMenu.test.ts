import { describe, expect, it } from "vitest";
import { isNativeContextMenuEvent, isShiftSecondaryPointerPress } from "./nativeContextMenu";

// Shift+right-click native-menu escape (issue #5407): the `contextmenu`
// predicate keys on Shift alone because that event already implies secondary
// activation, while the press-phase predicate needs the explicit
// secondary-button check so Shift+primary selection stays inert.
describe("nativeContextMenu", () => {
    it("treats a Shift-held contextmenu as the native escape regardless of button", () => {
        expect(isNativeContextMenuEvent(new MouseEvent("contextmenu", { shiftKey: true, button: 2 }))).toBe(true);
        expect(isNativeContextMenuEvent(new MouseEvent("contextmenu", { shiftKey: true, button: 0 }))).toBe(true);
        expect(isNativeContextMenuEvent(new MouseEvent("contextmenu", { button: 2 }))).toBe(false);
        expect(isNativeContextMenuEvent(new MouseEvent("contextmenu"))).toBe(false);
    });

    it("treats only Shift+secondary press-phase events as the escape gesture", () => {
        expect(isShiftSecondaryPointerPress(new MouseEvent("pointerdown", { shiftKey: true, button: 2 }))).toBe(true);
        expect(isShiftSecondaryPointerPress(new PointerEvent("pointerdown", { shiftKey: true, button: 2 }))).toBe(true);
        expect(isShiftSecondaryPointerPress(new MouseEvent("pointerdown", { shiftKey: true, button: 0 }))).toBe(false);
        expect(isShiftSecondaryPointerPress(new MouseEvent("pointerdown", { button: 2 }))).toBe(false);
        expect(isShiftSecondaryPointerPress(new MouseEvent("mousedown", { button: 0 }))).toBe(false);
    });
});
