/**
 * Shift+right-click native-menu routing (#5407) at the application-menu layer.
 *
 * Each menu family renders a full-viewport backdrop while open. The backdrop
 * must close its menu for the native gesture WITHOUT cancelling the
 * `contextmenu` event, and must also dismiss from the press that starts the
 * gesture: some browsers show the native menu without dispatching a DOM
 * `contextmenu` event at all. Ordinary right-clicks keep their existing
 * prevent-and-close behavior.
 */
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import CalendarEntryContextMenu from "./calendar/CalendarEntryContextMenu.svelte";
import LayoutContextMenu from "./layout/LayoutContextMenu.svelte";
import OutlinerItemContextMenu from "./OutlinerItemContextMenu.svelte";

function shiftRightContextMenu(target: Element): boolean {
    return target.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, shiftKey: true }),
    );
}

function ordinaryContextMenu(target: Element): boolean {
    return target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
}

function shiftRightPress(target: Element): boolean {
    return target.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2, shiftKey: true }),
    );
}

describe("application-menu backdrops yield to Shift+right-click (#5407)", () => {
    it("dismisses from contextmenu on every menu panel without invoking an action", () => {
        const cases = [
            (onClose: () => void, onAction: () => void) =>
                render(OutlinerItemContextMenu, {
                    x: 10,
                    y: 10,
                    voted: false,
                    isCommentsVisible: false,
                    kind: "text",
                    onClose,
                    onAction,
                }),
            (onClose: () => void, onAction: () => void) =>
                render(LayoutContextMenu, { x: 10, y: 10, onInsertExistingDiagram: () => {}, onClose, onAction }),
            (onClose: () => void, onAction: () => void) =>
                render(CalendarEntryContextMenu, { x: 10, y: 10, entryTitle: "Standup", onClose, onDelete: onAction }),
        ];
        for (const renderMenu of cases) {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const { container, unmount } = renderMenu(onClose, onAction);
            expect(shiftRightContextMenu(container.querySelector('[role="menu"]')!)).toBe(true);
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(onAction).not.toHaveBeenCalled();
            unmount();
        }
    });
    it("item menu: native gesture closes without cancelling; ordinary still cancels", async () => {
        const onClose = vi.fn();
        const { container, unmount } = render(OutlinerItemContextMenu, {
            x: 10,
            y: 10,
            voted: false,
            isCommentsVisible: false,
            kind: "text",
            onClose,
            onAction: () => {},
        });
        const overlay = container.querySelector(".context-menu-overlay")!;

        expect(shiftRightContextMenu(overlay)).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
        unmount();

        const reopened = vi.fn();
        const second = render(OutlinerItemContextMenu, {
            x: 10,
            y: 10,
            voted: false,
            isCommentsVisible: false,
            kind: "text",
            onClose: reopened,
            onAction: () => {},
        });
        const secondOverlay = second.container.querySelector(".context-menu-overlay")!;
        expect(ordinaryContextMenu(secondOverlay)).toBe(false);
        expect(reopened).toHaveBeenCalledTimes(1);
        second.unmount();
    });

    it("layout menu: native gesture closes without cancelling; ordinary still cancels", () => {
        const onClose = vi.fn();
        const { container, unmount } = render(LayoutContextMenu, {
            x: 10,
            y: 10,
            onClose,
            onAction: () => {},
            onInsertExistingDiagram: () => {},
        });
        const overlay = container.querySelector(".context-menu-overlay")!;

        expect(shiftRightContextMenu(overlay)).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
        unmount();

        const reopened = vi.fn();
        const second = render(LayoutContextMenu, {
            x: 10,
            y: 10,
            onClose: reopened,
            onAction: () => {},
            onInsertExistingDiagram: () => {},
        });
        expect(ordinaryContextMenu(second.container.querySelector(".context-menu-overlay")!)).toBe(false);
        expect(reopened).toHaveBeenCalledTimes(1);
        second.unmount();
    });

    it("calendar entry menu: native gesture closes without cancelling; ordinary still cancels", () => {
        const onClose = vi.fn();
        const { container, unmount } = render(CalendarEntryContextMenu, {
            x: 10,
            y: 10,
            entryTitle: "Standup",
            onDelete: () => {},
            onClose,
        });
        const overlay = container.querySelector(".overlay")!;

        expect(shiftRightContextMenu(overlay)).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
        unmount();

        const reopened = vi.fn();
        const second = render(CalendarEntryContextMenu, {
            x: 10,
            y: 10,
            entryTitle: "Standup",
            onDelete: () => {},
            onClose: reopened,
        });
        expect(ordinaryContextMenu(second.container.querySelector(".overlay")!)).toBe(false);
        expect(reopened).toHaveBeenCalledTimes(1);
        second.unmount();
    });

    it("dismisses from the press alone when no contextmenu event follows (all families)", async () => {
        const itemClose = vi.fn();
        const item = render(OutlinerItemContextMenu, {
            x: 10,
            y: 10,
            voted: false,
            isCommentsVisible: false,
            kind: "text",
            onClose: itemClose,
            onAction: () => {},
        });
        // The press lands anywhere — e.g. the menu panel itself — and still
        // reaches the window listener. It must not be cancelled either.
        const panel = item.container.querySelector(".context-menu")!;
        expect(shiftRightPress(panel)).toBe(true);
        expect(itemClose).toHaveBeenCalledTimes(1);
        item.unmount();

        const layoutClose = vi.fn();
        const layout = render(LayoutContextMenu, {
            x: 10,
            y: 10,
            onClose: layoutClose,
            onAction: () => {},
            onInsertExistingDiagram: () => {},
        });
        expect(shiftRightPress(layout.container.querySelector(".context-menu")!)).toBe(true);
        expect(layoutClose).toHaveBeenCalledTimes(1);
        layout.unmount();

        const entryClose = vi.fn();
        const entry = render(CalendarEntryContextMenu, {
            x: 10,
            y: 10,
            entryTitle: "Standup",
            onDelete: () => {},
            onClose: entryClose,
        });
        expect(shiftRightPress(entry.container.querySelector(".calendar-entry-context-menu")!)).toBe(true);
        expect(entryClose).toHaveBeenCalledTimes(1);
        entry.unmount();
    });

    it("ignores other presses: primary, unmodified secondary, and touch-style contact", async () => {
        const onClose = vi.fn();
        const { container, unmount } = render(OutlinerItemContextMenu, {
            x: 10,
            y: 10,
            voted: false,
            isCommentsVisible: false,
            kind: "text",
            onClose,
            onAction: () => {},
        });
        const panel = container.querySelector(".context-menu")!;
        // No dismissal and no cancellation for gestures outside the contract.
        await fireEvent.mouseDown(panel, { button: 0, shiftKey: true });
        await fireEvent.mouseDown(panel, { button: 2, shiftKey: false });
        await fireEvent.mouseDown(panel, { button: 0, shiftKey: false });
        expect(onClose).not.toHaveBeenCalled();
        unmount();
    });
});
