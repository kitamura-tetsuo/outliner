import { afterEach, describe, expect, it } from "vitest";
import { Project } from "../schema/app-schema";
import { store as generalStore } from "../stores/store.svelte";
import { insertItemAfterTargetOrAppend } from "./itemUtils";

function seedPage(lines: string[]) {
    const project = Project.createInstance("test");
    const page = project.addPage("page1", "u1");
    for (const line of lines) {
        page.items.addNode("u1").updateText(line);
    }
    generalStore.project = project;
    generalStore.currentPage = page;
    return page;
}

const texts = (items: { length: number; at: (i: number) => { text: string; } | undefined; }) =>
    Array.from({ length: items.length }, (_, i) => items.at(i)?.text);

describe("insertItemAfterTargetOrAppend", () => {
    afterEach(() => {
        generalStore.currentPage = undefined;
        generalStore.project = undefined;
    });

    it("inserts as the next sibling of the target", () => {
        const page = seedPage(["alpha", "beta", "gamma"]);
        const target = page.items.at(0)!;

        const inserted = insertItemAfterTargetOrAppend(target, "u1");
        inserted!.updateText("new");

        expect(texts(page.items)).toEqual(["alpha", "new", "beta", "gamma"]);
    });

    it("inserts as the next sibling at the target's own depth", () => {
        const page = seedPage(["alpha"]);
        const parent = page.items.at(0)!;
        parent.items.addNode("u1").updateText("child1");
        parent.items.addNode("u1").updateText("child2");

        const inserted = insertItemAfterTargetOrAppend(parent.items.at(0)!, "u1");
        inserted!.updateText("new");

        expect(texts(parent.items)).toEqual(["child1", "new", "child2"]);
        expect(texts(page.items)).toEqual(["alpha"]);
    });

    it("appends to the page when there is no target", () => {
        const page = seedPage(["alpha", "beta"]);

        const inserted = insertItemAfterTargetOrAppend(undefined, "u1");
        inserted!.updateText("new");

        expect(texts(page.items)).toEqual(["alpha", "beta", "new"]);
    });

    it("appends to the page when the target is the page's own row", () => {
        const page = seedPage(["alpha", "beta"]);

        // The page renders its own row in the outliner; its siblings are other
        // pages, so a command typed there must create a top-level item instead.
        const inserted = insertItemAfterTargetOrAppend(page, "u1");
        inserted!.updateText("new");

        expect(texts(page.items)).toEqual(["alpha", "beta", "new"]);
    });

    it("returns undefined when no page is open", () => {
        generalStore.project = undefined;
        generalStore.currentPage = undefined;

        expect(insertItemAfterTargetOrAppend(undefined, "u1")).toBeUndefined();
    });
});
