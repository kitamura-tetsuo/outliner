/**
 * Shift+right-click native-menu routing (#5407) on the Layout surface.
 *
 * The gesture must neither cancel the `contextmenu` event nor open the Layout
 * insertion menu — while an already-open menu is dismissed, including from the
 * press alone for browsers that never dispatch `contextmenu` for the gesture.
 * Unmodified right-clicks keep opening the insertion menu.
 */
import { render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { Item, Project } from "../../schema/app-schema";
import { LAYOUT_COMPONENT_TYPE } from "../../services/layout/layoutModel";
import LayoutBlock from "./LayoutBlock.svelte";

function buildEmptyLayout(): Item {
    const project = Project.createInstance("Layout native-menu tests");
    const page = project.addPage("Page", "tester");
    const layout = page.items.addNode("tester");
    layout.componentType = LAYOUT_COMPONENT_TYPE;
    return layout;
}

function shiftRightContextMenu(target: Element): boolean {
    return target.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, shiftKey: true }),
    );
}

describe("LayoutBlock Shift+right-click yields to the native menu (#5407)", () => {
    it("does not cancel the event or open the insertion menu", async () => {
        const layout = buildEmptyLayout();
        const { getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });

        const emptyState = getByTestId("layout-empty");
        expect(shiftRightContextMenu(emptyState)).toBe(true);
        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).toBeNull();
        });
        unmount();
    });

    it("dismisses an open menu from the same gesture without cancelling", async () => {
        const layout = buildEmptyLayout();
        const { getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });

        const emptyState = getByTestId("layout-empty");
        emptyState.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).not.toBeNull();
        });

        expect(shiftRightContextMenu(getByTestId("layout-context-menu"))).toBe(true);
        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).toBeNull();
        });
        unmount();
    });

    it("dismisses an open menu from the press alone (no contextmenu event)", async () => {
        const layout = buildEmptyLayout();
        const { getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });

        const emptyState = getByTestId("layout-empty");
        emptyState.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).not.toBeNull();
        });

        const press = new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 2,
            shiftKey: true,
        });
        expect(getByTestId("layout-context-menu").dispatchEvent(press)).toBe(true);
        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).toBeNull();
        });
        unmount();
    });

    it("still opens the insertion menu on an unmodified right-click", async () => {
        const layout = buildEmptyLayout();
        const { getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });

        const emptyState = getByTestId("layout-empty");
        emptyState.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).not.toBeNull();
        });
        unmount();
    });
});
