import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Item, Project } from "../../schema/app-schema";

// Svelte store mock as permitted by AGENTS.md: placement needs to know which
// item is the page's own row (never replaceable) and that lives in a
// module-level store. Everything else runs against a real Y.Doc.
const state: { page: Item | undefined; } = { page: undefined };
vi.mock("../../stores/store.svelte", () => ({
    store: {
        get currentPage() {
            return state.page;
        },
    },
}));

const { canReplaceWithVisualNode, createVisualNodeAtTarget } = await import("./visualNodePlacement");

describe("visual node placement (#5015)", () => {
    let project: Project;
    let page: Item;

    beforeEach(() => {
        project = Project.createInstance("Placement tests");
        page = project.addPage("Page", "tester");
        state.page = page;
    });

    function addText(text: string): Item {
        const item = page.items.addNode("tester");
        item.updateText(text);
        return item;
    }

    const childTexts = () => [...page.items].map(item => String(item.text ?? ""));
    const childKinds = () => [...page.items].map(item => item.componentType);

    describe("eligibility", () => {
        it("accepts a normal Text node left empty once the command is removed", () => {
            expect(canReplaceWithVisualNode(addText(""), "")).toBe(true);
            expect(canReplaceWithVisualNode(addText("/grid"), "   ")).toBe(true);
        });

        it("refuses a node that still holds user text", () => {
            expect(canReplaceWithVisualNode(addText("alpha"), "alpha")).toBe(false);
        });

        it("refuses a node with children, whose descendants would be lost", () => {
            const parent = addText("");
            parent.items.addNode("tester");
            expect(canReplaceWithVisualNode(parent, "")).toBe(false);
        });

        it("refuses the page-title node, which names the page", () => {
            expect(canReplaceWithVisualNode(page, "")).toBe(false);
        });

        it("refuses a node that is already a visual node", () => {
            const grid = page.items.addNode("tester");
            grid.componentType = "yjstable";
            expect(canReplaceWithVisualNode(grid, "")).toBe(false);
        });

        it("refuses a missing node", () => {
            expect(canReplaceWithVisualNode(undefined, "")).toBe(false);
        });
    });

    describe("replacement", () => {
        it("removes the empty Text node and inserts the block at its sibling index", () => {
            addText("A");
            const blank = addText("");
            addText("B");

            const created = createVisualNodeAtTarget(blank, "", "yjstable", "tester");

            expect(created?.placement).toBe("replaced");
            expect(childKinds()).toEqual([undefined, "yjstable", undefined]);
            expect(childTexts()).toEqual(["A", "", "B"]);
            expect([...page.items].map(item => item.id)).toContain(created!.item.id);
            expect([...page.items].map(item => item.id)).not.toContain(blank.id);
        });

        it("creates a new node rather than retyping the old one", () => {
            const blank = addText("");
            const created = createVisualNodeAtTarget(blank, "", "calendar", "tester");

            expect(created?.item.id).not.toBe(blank.id);
            expect(created?.item.componentType).toBe("calendar");
        });

        it("keeps text the user typed beside the command, inserting the block after it", () => {
            const alpha = addText("alpha");

            const created = createVisualNodeAtTarget(alpha, "alpha", "yjstable", "tester");

            expect(created?.placement).toBe("inserted-after");
            expect(childTexts()).toEqual(["alpha", ""]);
            expect(childKinds()).toEqual([undefined, "yjstable"]);
            expect(alpha.componentType).toBeUndefined();
            expect(alpha.text).toBe("alpha");
        });

        it("keeps a node's children, inserting the block after it", () => {
            const parent = addText("");
            const child = parent.items.addNode("tester");
            child.updateText("child");

            const created = createVisualNodeAtTarget(parent, "", "layout", "tester");

            expect(created?.placement).toBe("inserted-after");
            expect([...parent.items].map(item => String(item.text ?? ""))).toEqual(["child"]);
            expect(childKinds()).toEqual([undefined, "layout"]);
        });

        it("never replaces the page-title node", () => {
            const created = createVisualNodeAtTarget(page, "", "yjstable", "tester");

            expect(created?.placement).toBe("inserted-after");
            expect(page.componentType).toBeUndefined();
            expect(page.text).toBe("Page");
        });

        it("runs the replacement as one undoable transaction", () => {
            addText("A");
            const blank = addText("");

            const updates: number[] = [];
            project.ydoc.on("afterTransaction", () => updates.push(1));
            createVisualNodeAtTarget(blank, "", "yjstable", "tester");

            // Delete + insert land in a single transaction, so collaborators
            // never observe a state with both nodes or with neither.
            expect(updates).toHaveLength(1);
        });
    });
});
