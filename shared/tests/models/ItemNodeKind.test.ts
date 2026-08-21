import { describe, expect, it } from "vitest";
import { Item, type PlainItemData, Project } from "../../src/app-schema";

/**
 * The schema is the last line of defence for two of the node-kind rules
 * (#5015): only a Text node owns outline text, and a node's kind is fixed once
 * it is created. Enforcing them here means no call site — editor, paste,
 * seeding, or one written later — can produce a node the model forbids.
 */
describe("Item node kinds (#5015)", () => {
    function pageItem() {
        const project = Project.createInstance("Node kinds");
        const page = project.addPage("Page", "tester");
        return page.items.addNode("tester");
    }

    it("keeps ordinary text on a Text node", () => {
        const item = pageItem();
        item.updateText("Upcoming tasks");
        expect(item.text).toBe("Upcoming tasks");
    });

    it("refuses to write outline text onto a Grid, Calendar or Layout node", () => {
        for (const componentType of ["yjstable", "calendar", "layout"]) {
            const item = pageItem();
            item.componentType = componentType;
            item.updateText("a caption that must not stick");
            expect(item.text).toBe("");
        }
    });

    it("reads a visual node as text-less even when stale text is already stored", () => {
        const item = pageItem();
        item.updateText("text written while it was still a Text node");
        item.componentType = "yjstable";

        expect(item.text).toBe("");
        // And the first write clears the stale value rather than preserving it.
        item.updateText("");
        expect(item.text).toBe("");
    });

    it("stamps a kind onto a blank node exactly once", () => {
        const item = pageItem();
        expect(item.componentType).toBeUndefined();
        item.componentType = "yjstable";
        expect(item.componentType).toBe("yjstable");
    });

    it("refuses every kind change after creation", () => {
        const grid = pageItem();
        grid.componentType = "yjstable";

        grid.componentType = "calendar";
        expect(grid.componentType).toBe("yjstable");

        grid.componentType = undefined;
        expect(grid.componentType).toBe("yjstable");

        const layout = pageItem();
        layout.componentType = "layout";
        layout.componentType = undefined;
        expect(layout.componentType).toBe("layout");
    });

    it("leaves the plain-object Item constructor usable for text", () => {
        const item = new Item({ id: "plain", text: "Hello" } as PlainItemData);
        expect(item.text).toBe("Hello");
    });
});
