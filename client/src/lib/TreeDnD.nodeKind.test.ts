import { describe, expect, it } from "vitest";
import { Item, Project } from "../schema/app-schema";
import { LAYOUT_COMPONENT_TYPE } from "../services/layout/layoutModel";
import type { DisplayItem } from "../stores/OutlinerViewModel";
import { TreeDnD } from "./TreeDnD";

/**
 * Grid and Calendar are leaf kinds (#5015). Drag & drop is one of the paths
 * that must not be able to give them children, and it has to refuse such a drop
 * outright rather than relying on the renderer to hide the result.
 */
function buildTree() {
    const project = Project.createInstance("Node-kind DnD tests");
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

    return { page, add, controller };
}

const childIds = (item: Item) => [...item.items].map(child => child.id);
const pageIds = (page: Item) => [...page.items].map(child => child.id);

describe("TreeDnD and leaf node kinds (#5015)", () => {
    for (const [label, componentType] of [["Grid", "yjstable"], ["Calendar", "calendar"]] as const) {
        it(`refuses to nest a text item under a ${label} leaf`, () => {
            const { page, add, controller } = buildTree();
            const leaf = add(item => {
                item.componentType = componentType;
            });
            const note = add(item => item.updateText("note"));

            controller([leaf, note]).moveItem(note.id, leaf.id, "middle");

            expect(childIds(leaf)).toEqual([]);
            expect(pageIds(page)).toEqual([leaf.id, note.id]);
        });

        it(`refuses to nest a block under a ${label} leaf`, () => {
            const { page, add, controller } = buildTree();
            const leaf = add(item => {
                item.componentType = componentType;
            });
            const other = add(item => {
                item.componentType = "yjstable";
                item.yjsTableId = "table-1";
            });

            controller([leaf, other]).moveItem(other.id, leaf.id, "middle");

            expect(childIds(leaf)).toEqual([]);
            expect(pageIds(page)).toEqual([leaf.id, other.id]);
        });
    }

    it("still nests an item under an ordinary Text node", () => {
        const { add, controller } = buildTree();
        const heading = add(item => item.updateText("Upcoming tasks"));
        const note = add(item => item.updateText("note"));

        controller([heading, note]).moveItem(note.id, heading.id, "middle");

        expect(childIds(heading)).toEqual([note.id]);
    });

    it("lets a Text node own a Grid child, so a heading can own its block", () => {
        const { add, controller } = buildTree();
        const heading = add(item => item.updateText("Upcoming tasks"));
        const grid = add(item => {
            item.componentType = "yjstable";
            item.yjsTableId = "table-1";
        });

        controller([heading, grid]).moveItem(grid.id, heading.id, "middle");

        expect(childIds(heading)).toEqual([grid.id]);
    });

    it("refuses a sibling drop that would put ordinary text inside a Layout", () => {
        const project = Project.createInstance("Sibling drop tests");
        const page = project.addPage("Page", "tester");
        const layout = page.items.addNode("tester");
        layout.componentType = LAYOUT_COMPONENT_TYPE;
        const block = layout.items.addNode("tester");
        block.componentType = "yjstable";
        block.yjsTableId = "table-1";
        const note = page.items.addNode("tester");
        note.updateText("note");

        const rows = [page, layout, block, note];
        const controller = new TreeDnD({
            get displayItems() {
                return rows.map((item, index) => ({
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
                })) as DisplayItem[];
            },
            pageItem: page,
            onStructureChanged() {},
        });

        controller.moveItem(note.id, block.id, "bottom");

        expect(childIds(layout)).toEqual([block.id]);
        expect(pageIds(page)).toEqual([layout.id, note.id]);
    });
});
