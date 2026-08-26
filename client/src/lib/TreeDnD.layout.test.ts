import { describe, expect, it } from "vitest";
import { Item, Project } from "../schema/app-schema";
import { DEFAULT_COLUMN_SPAN, LAYOUT_COMPONENT_TYPE } from "../services/layout/layoutModel";
import type { DisplayItem } from "../stores/OutlinerViewModel";
import { TreeDnD } from "./TreeDnD";

/**
 * The Layout child constraint lives in the one place item drag & drop moves a
 * node (#4997), so these tests drive the real controller against a real tree.
 */
function buildTree() {
    const project = Project.createInstance("DnD tests");
    const page = project.addPage("Page", "tester");

    const add = (configure?: (item: Item) => void) => {
        const item = page.items.addNode("tester");
        configure?.(item);
        return item;
    };

    const displayFor = (items: Item[]): DisplayItem[] =>
        items.map((item, index) => ({
            model: {
                id: item.id,
                original: item,
                text: String(item.text ?? ""),
                votes: [],
                author: "tester",
                created: 0,
                lastChanged: 0,
                commentCount: 0,
            },
            depth: index === 0 ? 0 : 1,
            parentId: null,
        }));

    const controller = (items: Item[]) =>
        new TreeDnD({
            get displayItems() {
                return displayFor([page, ...items]);
            },
            pageItem: page,
            onStructureChanged() {},
        });

    return { project, page, add, controller };
}

const childIds = (item: Item) => [...item.items].map(child => child.id);
const pageIds = (page: Item) => [...page.items].map(child => child.id);

describe("TreeDnD and the Layout child constraint", () => {
    it("nests a Grid dropped onto a Layout and gives it the default span", () => {
        const { page, add, controller } = buildTree();
        const layout = add(item => {
            item.componentType = LAYOUT_COMPONENT_TYPE;
        });
        const grid = add(item => {
            item.componentType = "yjstable";
            item.yjsTableId = "table-1";
        });

        controller([layout, grid]).moveItem(grid.id, layout.id, "middle");

        expect(childIds(layout)).toEqual([grid.id]);
        expect(grid.columnSpan).toBe(DEFAULT_COLUMN_SPAN);
        expect(pageIds(page)).toEqual([layout.id]);
    });

    it("accepts a Calendar as well", () => {
        const { add, controller } = buildTree();
        const layout = add(item => {
            item.componentType = LAYOUT_COMPONENT_TYPE;
        });
        const calendar = add(item => {
            item.componentType = "calendar";
            item.calendarId = "cal-1";
        });

        controller([layout, calendar]).moveItem(calendar.id, layout.id, "middle");

        expect(childIds(layout)).toEqual([calendar.id]);
    });

    it("refuses an ordinary text item and leaves the tree unchanged", () => {
        const { page, add, controller } = buildTree();
        const layout = add(item => {
            item.componentType = LAYOUT_COMPONENT_TYPE;
        });
        const text = add(item => item.updateText("just text"));

        controller([layout, text]).moveItem(text.id, layout.id, "middle");

        expect(childIds(layout)).toEqual([]);
        expect(pageIds(page)).toEqual([layout.id, text.id]);
        expect(text.columnSpan).toBeUndefined();
    });

    it("refuses a nested Layout", () => {
        const { page, add, controller } = buildTree();
        const outer = add(item => {
            item.componentType = LAYOUT_COMPONENT_TYPE;
        });
        const inner = add(item => {
            item.componentType = LAYOUT_COMPONENT_TYPE;
        });

        controller([outer, inner]).moveItem(inner.id, outer.id, "middle");

        expect(childIds(outer)).toEqual([]);
        expect(pageIds(page)).toEqual([outer.id, inner.id]);
    });

    it("still nests an ordinary item under an ordinary item", () => {
        const { page, add, controller } = buildTree();
        const parent = add(item => item.updateText("parent"));
        const child = add(item => item.updateText("child"));

        controller([parent, child]).moveItem(child.id, parent.id, "middle");

        expect(childIds(parent)).toEqual([child.id]);
        expect(pageIds(page)).toEqual([parent.id]);
        // No layout metadata is written by an ordinary nest.
        expect(child.columnSpan).toBeUndefined();
    });

    it("reorders siblings without touching layout metadata", () => {
        const { page, add, controller } = buildTree();
        const first = add(item => item.updateText("first"));
        const second = add(item => item.updateText("second"));

        controller([first, second]).moveItem(second.id, first.id, "top");

        expect(pageIds(page)).toEqual([second.id, first.id]);
    });

    it("moves a hidden Layout child back into outline flow and clears its span", () => {
        const { page, add, controller } = buildTree();
        const layout = add(item => {
            item.componentType = LAYOUT_COMPONENT_TYPE;
        });
        const target = add(item => item.updateText("target"));
        const grid = add(item => {
            item.componentType = "yjstable";
            item.columnSpan = 5;
        });
        page.items.tree.moveChildToParent(grid.key, layout.key);
        page.items.tree.recomputeParentsAndChildren();

        controller([layout, target]).moveItem(grid.id, target.id, "bottom");

        expect(pageIds(page)).toEqual([layout.id, target.id, grid.id]);
        expect(childIds(layout)).toEqual([]);
        expect(grid.columnSpan).toBeUndefined();
    });
});
