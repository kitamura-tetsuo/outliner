import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Item, Project } from "../../schema/app-schema";
import { DEFAULT_COLUMN_SPAN, LAYOUT_COLUMN_COUNT, LAYOUT_COMPONENT_TYPE } from "./layoutModel";
import {
    adjustColumnSpan,
    canAcceptAsLayoutChild,
    canConvertToLayout,
    columnSpanOf,
    isLayoutItem,
    layoutChildren,
    moveIntoLayout,
    moveOutOfLayout,
    moveWithinLayout,
    rowIndexOfChild,
    setColumnSpan,
    unwrapLayout,
} from "./layoutTree";

/**
 * A real project doc with a page: the Layout is nothing but ordinary tree
 * items, so these tests exercise the same Yjs structures the editor writes
 * rather than a stand-in for them.
 */
function buildPage() {
    const project = Project.createInstance("Layout tests");
    const page = project.addPage("Page", "tester");
    return { project, page };
}

function addGrid(parent: { addNode: (author: string) => Item; }, tableId: string): Item {
    const item = parent.addNode("tester");
    item.componentType = "yjstable";
    item.yjsTableId = tableId;
    return item;
}

function addCalendar(parent: { addNode: (author: string) => Item; }, calendarId: string): Item {
    const item = parent.addNode("tester");
    item.componentType = "calendar";
    item.calendarId = calendarId;
    return item;
}

function addText(parent: { addNode: (author: string) => Item; }, text: string): Item {
    const item = parent.addNode("tester");
    item.updateText(text);
    return item;
}

function addLayout(parent: { addNode: (author: string) => Item; }): Item {
    const item = parent.addNode("tester");
    item.componentType = LAYOUT_COMPONENT_TYPE;
    return item;
}

const idsOf = (items: Item[]) => items.map(item => item.id);
const textsOf = (items: Item[]) => items.map(item => String(item.text ?? ""));

describe("layoutTree", () => {
    describe("child eligibility", () => {
        it("accepts Grid and Calendar blocks", () => {
            const { page } = buildPage();
            expect(canAcceptAsLayoutChild(addGrid(page.items, "t1"))).toBe(true);
            expect(canAcceptAsLayoutChild(addCalendar(page.items, "c1"))).toBe(true);
        });

        it("rejects ordinary text items and nested Layouts", () => {
            const { page } = buildPage();
            expect(canAcceptAsLayoutChild(addText(page.items, "just text"))).toBe(false);
            expect(canAcceptAsLayoutChild(addLayout(page.items))).toBe(false);
        });

        it("recognizes a Layout container", () => {
            const { page } = buildPage();
            expect(isLayoutItem(addLayout(page.items))).toBe(true);
            expect(isLayoutItem(addGrid(page.items, "t1"))).toBe(false);
            expect(isLayoutItem(addText(page.items, "text"))).toBe(false);
            expect(isLayoutItem(undefined)).toBe(false);
        });
    });

    describe("moveIntoLayout", () => {
        it("moves a visual item into the Layout and gives it the default span", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const grid = addGrid(page.items, "t1");

            expect(moveIntoLayout(layout, grid)).toBe(true);
            expect(idsOf(layoutChildren(layout))).toEqual([grid.id]);
            expect(grid.columnSpan).toBe(DEFAULT_COLUMN_SPAN);
            expect(idsOf([...page.items])).toEqual([layout.id]);
        });

        it("keeps an existing span instead of resetting it", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const grid = addGrid(page.items, "t1");
            grid.columnSpan = 4;

            moveIntoLayout(layout, grid);
            expect(grid.columnSpan).toBe(4);
        });

        it("inserts at the requested position among existing children", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const first = addGrid(layout.items, "t1");
            const second = addGrid(layout.items, "t2");
            const incoming = addCalendar(page.items, "c1");

            moveIntoLayout(layout, incoming, 1);
            expect(idsOf(layoutChildren(layout))).toEqual([first.id, incoming.id, second.id]);
        });

        it("rejects a text item and leaves the tree unchanged", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const text = addText(page.items, "plain");

            expect(moveIntoLayout(layout, text)).toBe(false);
            expect(layoutChildren(layout)).toHaveLength(0);
            expect(idsOf([...page.items])).toEqual([layout.id, text.id]);
        });

        it("rejects a nested Layout", () => {
            const { page } = buildPage();
            const outer = addLayout(page.items);
            const inner = addLayout(page.items);

            expect(moveIntoLayout(outer, inner)).toBe(false);
            expect(layoutChildren(outer)).toHaveLength(0);
        });
    });

    describe("span metadata", () => {
        it("clamps a written span to 1..12", () => {
            const { page } = buildPage();
            const grid = addGrid(page.items, "t1");

            expect(setColumnSpan(grid, 20)).toBe(LAYOUT_COLUMN_COUNT);
            expect(grid.columnSpan).toBe(LAYOUT_COLUMN_COUNT);
            expect(setColumnSpan(grid, 0)).toBe(1);
            expect(grid.columnSpan).toBe(1);
        });

        it("repairs an invalid persisted span when read", () => {
            const { page } = buildPage();
            const grid = addGrid(page.items, "t1");
            (grid.tree.getNodeValueFromKey(grid.key) as Y.Map<unknown>).set("columnSpan", 99);

            expect(columnSpanOf(grid)).toBe(LAYOUT_COLUMN_COUNT);
        });

        it("steps by whole columns and does not reorder the Layout", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const first = addGrid(layout.items, "t1");
            const second = addGrid(layout.items, "t2");
            setColumnSpan(first, 6);
            setColumnSpan(second, 6);

            expect(adjustColumnSpan(first, 1)).toBe(7);
            expect(adjustColumnSpan(first, -3)).toBe(4);
            expect(idsOf(layoutChildren(layout))).toEqual([first.id, second.id]);
            expect(second.columnSpan).toBe(6);
        });
    });

    describe("moveWithinLayout", () => {
        it("reorders children as a plain tree reorder", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const a = addGrid(layout.items, "a");
            const b = addGrid(layout.items, "b");
            const c = addGrid(layout.items, "c");
            setColumnSpan(a, 4);

            expect(moveWithinLayout(layout, c, a, "before")).toBe(true);
            expect(idsOf(layoutChildren(layout))).toEqual([c.id, a.id, b.id]);
            // Reordering writes no placement data of its own.
            expect(a.columnSpan).toBe(4);
        });

        it("refuses to move an item that is not a child of this Layout", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const child = addGrid(layout.items, "a");
            const outside = addGrid(page.items, "b");

            expect(moveWithinLayout(layout, outside, child, "after")).toBe(false);
            expect(idsOf(layoutChildren(layout))).toEqual([child.id]);
        });
    });

    describe("moveOutOfLayout", () => {
        it("returns a child to normal outline flow and clears its span", () => {
            const { page } = buildPage();
            const before = addText(page.items, "before");
            const layout = addLayout(page.items);
            const grid = addGrid(layout.items, "t1");
            setColumnSpan(grid, 5);

            expect(moveOutOfLayout(layout, grid)).toBe(true);
            expect(layoutChildren(layout)).toHaveLength(0);
            expect(idsOf([...page.items])).toEqual([before.id, layout.id, grid.id]);
            expect(grid.columnSpan).toBeUndefined();
            // The component binding is untouched by the move.
            expect(grid.yjsTableId).toBe("t1");
        });

        it("leaves an empty Layout in place rather than deleting it", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            const grid = addGrid(layout.items, "t1");

            moveOutOfLayout(layout, grid);
            expect(idsOf([...page.items])).toContain(layout.id);
            expect(layoutChildren(layout)).toHaveLength(0);
        });
    });

    describe("unwrapLayout", () => {
        it("keeps the blocks, in order, at the Layout's position", () => {
            const { page } = buildPage();
            const before = addText(page.items, "before");
            const layout = addLayout(page.items);
            const first = addGrid(layout.items, "t1");
            const second = addCalendar(layout.items, "c1");
            setColumnSpan(first, 4);
            setColumnSpan(second, 8);
            const after = addText(page.items, "after");

            expect(unwrapLayout(layout)).toBe(true);
            expect(textsOf([...page.items])).toEqual(["before", "", "", "after"]);
            expect(idsOf([...page.items])).toEqual([before.id, first.id, second.id, after.id]);
            // Component bindings survive; only the arrangement is gone.
            expect(first.yjsTableId).toBe("t1");
            expect(second.calendarId).toBe("c1");
            expect(first.columnSpan).toBeUndefined();
        });

        it("removes an empty Layout without touching its siblings", () => {
            const { page } = buildPage();
            const before = addText(page.items, "before");
            const layout = addLayout(page.items);

            expect(unwrapLayout(layout)).toBe(true);
            expect(idsOf([...page.items])).toEqual([before.id]);
        });

        it("refuses to unwrap an item that is not a Layout", () => {
            const { page } = buildPage();
            const grid = addGrid(page.items, "t1");
            expect(unwrapLayout(grid)).toBe(false);
        });
    });

    describe("deletion", () => {
        it("follows normal subtree semantics: deleting the Layout deletes its children", () => {
            const { page } = buildPage();
            const layout = addLayout(page.items);
            addGrid(layout.items, "t1");
            addCalendar(layout.items, "c1");
            const sibling = addText(page.items, "sibling");

            layout.delete();

            expect(idsOf([...page.items])).toEqual([sibling.id]);
        });
    });

    describe("rowIndexOfChild", () => {
        it("puts 4 + 8 on one row", () => {
            expect(rowIndexOfChild([4, 8], 0)).toBe(0);
            expect(rowIndexOfChild([4, 8], 1)).toBe(0);
        });

        it("puts 6 + 6 on one row", () => {
            expect(rowIndexOfChild([6, 6], 1)).toBe(0);
        });

        it("wraps once the cumulative span exceeds 12", () => {
            const spans = [4, 8, 6, 6];
            expect(spans.map((_, index) => rowIndexOfChild(spans, index))).toEqual([0, 0, 1, 1]);
            expect(rowIndexOfChild([8, 8], 1)).toBe(1);
        });

        it("normalizes bad spans before wrapping", () => {
            expect(rowIndexOfChild([99, 1], 1)).toBe(1);
        });
    });

    describe("canConvertToLayout", () => {
        it("accepts an item with no children", () => {
            const { page } = buildPage();
            expect(canConvertToLayout(addText(page.items, "empty"))).toBe(true);
        });

        it("accepts an item whose children are all visual blocks", () => {
            const { page } = buildPage();
            const parent = addText(page.items, "parent");
            addGrid(parent.items, "t1");
            addCalendar(parent.items, "c1");

            expect(canConvertToLayout(parent)).toBe(true);
        });

        it("refuses an item with a text child, which a Layout could not render", () => {
            const { page } = buildPage();
            const parent = addText(page.items, "parent");
            addGrid(parent.items, "t1");
            addText(parent.items, "note");

            expect(canConvertToLayout(parent)).toBe(false);
        });

        it("refuses an item with a nested Layout child", () => {
            const { page } = buildPage();
            const parent = addText(page.items, "parent");
            addLayout(parent.items);

            expect(canConvertToLayout(parent)).toBe(false);
        });

        it("refuses an item that is already a Layout", () => {
            const { page } = buildPage();
            expect(canConvertToLayout(addLayout(page.items))).toBe(false);
            expect(canConvertToLayout(undefined)).toBe(false);
        });
    });
});
