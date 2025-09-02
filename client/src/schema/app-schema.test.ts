import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Item, Items, Project } from "./app-schema";

describe("Yjs app-schema", () => {
    it("creates a Project with Y.Doc and adds a page with title text", () => {
        const proj = Project.createInstance("My Project");
        expect(proj.title).toBe("My Project");

        const page = proj.addPage("First Page", "user1");
        expect(page).toBeInstanceOf(Item);
        // text is Y.Text and contains the title
        const t = page.text;
        expect(t).toBeInstanceOf(Y.Text);
        expect(t.toString()).toBe("First Page");
    });

    it("Items.addNode creates item where text is Y.Text and updateText works", () => {
        const proj = Project.createInstance("P");
        const rootItems = proj.items;
        const it = rootItems.addNode("u");
        expect(it.text).toBeInstanceOf(Y.Text);
        expect(it.text.toString()).toBe("");
        it.updateText("hello");
        expect(it.text.toString()).toBe("hello");
    });

    it("supports votes and attachments", () => {
        const proj = Project.createInstance("P");
        const it = proj.items.addNode("u");
        // votes
        expect(it.votes.toArray()).toEqual([]);
        it.toggleVote("u");
        expect(it.votes.toArray()).toEqual(["u"]);
        it.toggleVote("u");
        expect(it.votes.toArray()).toEqual([]);

        // attachments
        expect(it.attachments.toArray()).toEqual([]);
        it.addAttachment("url1");
        expect(it.attachments.toArray()).toEqual(["url1"]);
        it.removeAttachment("url1");
        expect(it.attachments.toArray()).toEqual([]);
    });

    it("Comments add/update/delete work", () => {
        const proj = Project.createInstance("P");
        const it = proj.items.addNode("u");
        const c = it.addComment("u", "hi");
        expect(it.comments.length).toBe(1);
        it.updateComment(c.id, "edited");
        expect(it.comments.length).toBe(1);
        it.deleteComment(c.id);
        expect(it.comments.length).toBe(0);
    });

    it("Items index access and removeAt behave", () => {
        const proj = Project.createInstance("P");
        const items = proj.items;
        const a = items.addNode("u");
        a.updateText("A");
        const b = items.addNode("u");
        b.updateText("B");

        // index access via at(i)
        expect(items.at(0)?.text.toString()).toBe("A");
        expect(items.at(1)?.text.toString()).toBe("B");

        // removeAt
        items.removeAt(0);
        expect(items.length).toBe(1);
        expect(items.at(0)?.text.toString()).toBe("B");
    });
});
