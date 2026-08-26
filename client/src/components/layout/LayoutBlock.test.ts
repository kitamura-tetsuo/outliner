import { render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { Item, Project } from "../../schema/app-schema";
import { LAYOUT_COMPONENT_TYPE } from "../../services/layout/layoutModel";
import LayoutBlock from "./LayoutBlock.svelte";

/**
 * A real project doc: the Layout reads its children straight from the tree, so
 * the test drives the same Yjs structures the editor writes.
 */
function buildLayout(children: Array<{ type: "yjstable" | "calendar"; span?: number; text?: string; }>) {
    const project = Project.createInstance("Layout block tests");
    const page = project.addPage("Page", "tester");
    const layout = page.items.addNode("tester");
    layout.componentType = LAYOUT_COMPONENT_TYPE;

    const created = children.map(({ type, span, text }) => {
        const child = layout.items.addNode("tester");
        child.componentType = type;
        if (type === "yjstable") child.yjsTableId = `table-${child.id}`;
        else child.calendarId = `calendar-${child.id}`;
        if (span !== undefined) child.columnSpan = span;
        if (text !== undefined) child.updateText(text);
        return child;
    });

    return { project, page, layout, children: created };
}

const spansOf = (container: HTMLElement) =>
    [...container.querySelectorAll("[data-testid='layout-cell']")]
        .map(cell => cell.getAttribute("data-column-span"));

const idsOf = (container: HTMLElement) =>
    [...container.querySelectorAll("[data-testid='layout-cell']")]
        .map(cell => cell.getAttribute("data-item-id"));

/** Raw node map of an item, for writes that bypass the schema accessors. */
const nodeMap = (item: Item) => item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;

describe("LayoutBlock", () => {
    it("renders a fixed 12-column grid", () => {
        const { layout } = buildLayout([{ type: "yjstable", span: 12 }]);
        const { getByTestId, unmount } = render(LayoutBlock, { item: layout });

        expect(getByTestId("layout-block").getAttribute("data-layout-columns")).toBe("12");
        expect(getByTestId("layout-grid")).toBeTruthy();
        unmount();
    });

    it("renders a span-4 block followed by a span-8 block, which share one row", () => {
        const { layout } = buildLayout([
            { type: "yjstable", span: 4 },
            { type: "calendar", span: 8 },
        ]);
        const { container, unmount } = render(LayoutBlock, { item: layout });

        expect(spansOf(container)).toEqual(["4", "8"]);
        unmount();
    });

    it("renders 6 + 6 as one row and wraps the next pair onto the following row", () => {
        const { layout } = buildLayout([
            { type: "yjstable", span: 6 },
            { type: "yjstable", span: 6 },
            { type: "calendar", span: 6 },
            { type: "calendar", span: 6 },
        ]);
        const { container, unmount } = render(LayoutBlock, { item: layout });

        // Auto-placement does the wrapping; the persisted data is only the spans.
        expect(spansOf(container)).toEqual(["6", "6", "6", "6"]);
        unmount();
    });

    it("renders children in tree order, which is also the accessible order", () => {
        const { layout, children } = buildLayout([
            { type: "yjstable", span: 4, text: "First" },
            { type: "calendar", span: 8, text: "Second" },
        ]);
        const { container, unmount } = render(LayoutBlock, { item: layout });

        expect(idsOf(container)).toEqual([children[0].id, children[1].id]);
        // A visual child owns no outline text (#5015), so its accessible name
        // is its kind - stale text on such a node is never used as a caption.
        const labels = [...container.querySelectorAll("[data-testid='layout-cell']")]
            .map(cell => cell.getAttribute("aria-label"));
        expect(labels).toEqual(["Grid block", "Calendar block"]);
        unmount();
    });

    it("falls back to full width for a child with no persisted span", () => {
        const { layout } = buildLayout([{ type: "yjstable" }]);
        const { container, unmount } = render(LayoutBlock, { item: layout });

        expect(spansOf(container)).toEqual(["12"]);
        unmount();
    });

    it("clamps an out-of-range persisted span instead of breaking the grid", () => {
        const { layout, children } = buildLayout([{ type: "yjstable" }, { type: "yjstable" }]);
        nodeMap(children[0]).set("columnSpan", 40);
        nodeMap(children[1]).set("columnSpan", 0);

        const { container, unmount } = render(LayoutBlock, { item: layout });
        expect(spansOf(container)).toEqual(["12", "1"]);
        unmount();
    });

    it("widens a child from its span control without reordering the children", async () => {
        const { layout, children } = buildLayout([
            { type: "yjstable", span: 4 },
            { type: "calendar", span: 8 },
        ]);
        const { container, unmount } = render(LayoutBlock, { item: layout });

        const increase = container.querySelectorAll("[data-testid='layout-span-increase']")[0] as HTMLButtonElement;
        increase.click();

        await waitFor(() => expect(spansOf(container)).toEqual(["5", "8"]));
        expect(children[0].columnSpan).toBe(5);
        expect(idsOf(container)).toEqual([children[0].id, children[1].id]);
        unmount();
    });

    it("clamps the span controls at the ends of the track system", async () => {
        const { layout, children } = buildLayout([{ type: "yjstable", span: 1 }]);
        const { container, unmount } = render(LayoutBlock, { item: layout });

        (container.querySelector("[data-testid='layout-span-decrease']") as HTMLButtonElement).click();
        await waitFor(() => expect(children[0].columnSpan).toBe(1));

        for (let step = 0; step < 15; step++) {
            (container.querySelector("[data-testid='layout-span-increase']") as HTMLButtonElement).click();
        }
        await waitFor(() => expect(spansOf(container)).toEqual(["12"]));
        unmount();
    });

    it("follows a collaborator's span change through the Yjs observer", async () => {
        const { layout, children } = buildLayout([
            { type: "yjstable", span: 4 },
            { type: "calendar", span: 8 },
        ]);
        const { container, unmount } = render(LayoutBlock, { item: layout });
        expect(spansOf(container)).toEqual(["4", "8"]);

        nodeMap(children[0]).set("columnSpan", 6);
        nodeMap(children[1]).set("columnSpan", 6);

        await waitFor(() => expect(spansOf(container)).toEqual(["6", "6"]));
        unmount();
    });

    it("follows a reorder of the underlying tree", async () => {
        const { layout, children } = buildLayout([
            { type: "yjstable", span: 4 },
            { type: "calendar", span: 8 },
        ]);
        const { container, unmount } = render(LayoutBlock, { item: layout });

        layout.tree.setNodeBefore(children[1].key, children[0].key);

        await waitFor(() => expect(idsOf(container)).toEqual([children[1].id, children[0].id]));
        // Order moved; the widths travelled with their own blocks.
        expect(spansOf(container)).toEqual(["8", "4"]);
        unmount();
    });

    it("keeps an empty Layout as a drop target rather than disappearing", async () => {
        const { layout, children } = buildLayout([{ type: "yjstable", span: 6 }]);
        const { container, getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });
        expect(queryByTestId("layout-empty")).toBeNull();

        children[0].delete();

        await waitFor(() => expect(spansOf(container)).toEqual([]));
        expect(getByTestId("layout-empty")).toBeTruthy();
        expect(getByTestId("layout-block").getAttribute("data-layout-child-count")).toBe("0");
        unmount();
    });

    it("shows grid guides only while the Layout is being edited", async () => {
        const { layout } = buildLayout([{ type: "yjstable", span: 6 }]);
        const { getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });

        expect(queryByTestId("layout-guides")).toBeNull();

        (getByTestId("layout-cell-resizer") as HTMLElement).focus();

        await waitFor(() => expect(queryByTestId("layout-guides")).not.toBeNull());
        expect(queryByTestId("layout-guides")!.childElementCount).toBe(12);
        unmount();
    });

    it("adjusts the span from the keyboard through the resize slider", async () => {
        const { layout, children } = buildLayout([{ type: "yjstable", span: 6 }]);
        const { getByTestId, unmount } = render(LayoutBlock, { item: layout });

        const resizer = getByTestId("layout-cell-resizer");
        expect(resizer.getAttribute("aria-valuemin")).toBe("1");
        expect(resizer.getAttribute("aria-valuemax")).toBe("12");
        expect(resizer.getAttribute("aria-valuenow")).toBe("6");

        resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        await waitFor(() => expect(children[0].columnSpan).toBe(7));

        resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        await waitFor(() => expect(children[0].columnSpan).toBe(6));

        resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        await waitFor(() => expect(children[0].columnSpan).toBe(12));

        resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
        await waitFor(() => expect(children[0].columnSpan).toBe(1));
        unmount();
    });

    it("moves a block back into normal outline flow from its cell action", async () => {
        const { page, layout, children } = buildLayout([{ type: "yjstable", span: 6 }]);
        const { getByTestId, unmount } = render(LayoutBlock, { item: layout });

        (getByTestId("layout-move-out") as HTMLButtonElement).click();

        await waitFor(() => expect([...layout.items]).toHaveLength(0));
        expect([...page.items].map(entry => entry.id)).toEqual([layout.id, children[0].id]);
        expect(children[0].columnSpan).toBeUndefined();
        unmount();
    });

    it("previews a pointer resize in whole columns and persists only the final span", async () => {
        const { layout, children } = buildLayout([
            { type: "yjstable", span: 4 },
            { type: "calendar", span: 8 },
        ]);
        const { container, getByTestId, unmount } = render(LayoutBlock, { item: layout });

        // jsdom has no layout engine, so the grid reports no width and a pointer
        // delta could not be converted into columns. This stands in for the
        // browser's measurement, nothing in the component under test.
        const grid = getByTestId("layout-grid");
        grid.getBoundingClientRect = () => ({ width: 1200, height: 200, top: 0, left: 0 }) as DOMRect;

        const resizer = container.querySelector("[data-testid='layout-cell-resizer']") as HTMLElement;
        // One column is 100px wide, so +230px rounds to two whole columns.
        resizer.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 400 }));
        resizer.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 630 }));

        await waitFor(() => expect(spansOf(container)).toEqual(["6", "8"]));
        // Still a preview: nothing has been written to the document yet.
        expect(children[0].columnSpan).toBe(4);

        resizer.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 630 }));
        await waitFor(() => expect(children[0].columnSpan).toBe(6));
        expect(spansOf(container)).toEqual(["6", "8"]);
        expect(idsOf(container)).toEqual([children[0].id, children[1].id]);
        unmount();
    });

    it("clamps a pointer resize to the track system", async () => {
        const { layout, children } = buildLayout([{ type: "yjstable", span: 4 }]);
        const { container, getByTestId, unmount } = render(LayoutBlock, { item: layout });
        const grid = getByTestId("layout-grid");
        grid.getBoundingClientRect = () => ({ width: 1200, height: 200, top: 0, left: 0 }) as DOMRect;

        const resizer = getByTestId("layout-cell-resizer");
        resizer.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 0 }));
        resizer.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5000 }));
        await waitFor(() => expect(spansOf(container)).toEqual(["12"]));

        resizer.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: -5000 }));
        await waitFor(() => expect(spansOf(container)).toEqual(["1"]));

        resizer.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: -5000 }));
        await waitFor(() => expect(children[0].columnSpan).toBe(1));
        unmount();
    });

    it("keeps an unexpected non-visual child visible as a plain-text cell", () => {
        // Both the drop guard and the "Change to Layout" guard prevent this,
        // but a document written elsewhere could still contain it, and the
        // item must not silently disappear.
        const { layout } = buildLayout([{ type: "yjstable", span: 6 }]);
        const stray = layout.items.addNode("tester");
        stray.updateText("a stray note");
        stray.columnSpan = 6;

        const { container, getByTestId, unmount } = render(LayoutBlock, { item: layout });

        expect(spansOf(container)).toEqual(["6", "6"]);
        expect(getByTestId("layout-cell-fallback").textContent?.trim()).toBe("a stray note");
        unmount();
    });

    it("opens a context menu on right click and can add visual nodes", async () => {
        const { layout } = buildLayout([]);
        const { getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });

        expect(queryByTestId("layout-context-menu")).toBeNull();

        // Right click the empty state container
        const emptyState = getByTestId("layout-empty");
        const rightClickEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        emptyState.dispatchEvent(rightClickEvent);

        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).not.toBeNull();
        });

        // Let's add a grid
        const addGridButton = getByTestId("layout-context-menu").querySelector("button");
        addGridButton?.click();

        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).toBeNull();
        });

        // Test if a grid was added
        expect(layout.items.length).toBe(1);
        expect([...layout.items][0].componentType).toBe("yjstable");

        unmount();
    });

    it("does not open a context menu when right clicking an interactive descendant", async () => {
        const { layout } = buildLayout([{ type: "yjstable" }]);
        const { getByTestId, queryByTestId, unmount } = render(LayoutBlock, { item: layout });

        expect(queryByTestId("layout-context-menu")).toBeNull();

        // Right click a layout cell
        const cell = getByTestId("layout-cell");
        const rightClickEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        cell.dispatchEvent(rightClickEvent);

        await waitFor(() => {
            expect(queryByTestId("layout-context-menu")).toBeNull();
        });

        unmount();
    });
});
