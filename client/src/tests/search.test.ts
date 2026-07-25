import { describe, expect, it } from "vitest";
import { findFirstReplaceTarget, replaceAll, replaceFirst, searchItems } from "../lib/search";
import { replaceAllInProject, replaceFirstInProject } from "../lib/search/projectSearch";
import { Item, Items, Project } from "../schema/app-schema";

function setupTree() {
    const project = Project.createInstance("Test");
    const page = project.addPage("root", "user");
    const child1 = (page.items as Items).addNode("user");
    child1.updateText("hello world");
    const child2 = (page.items as Items).addNode("user");
    child2.updateText("Hello World");
    return { project, page, child1, child2 };
}

/** Page title (depth-0) and a body item that both match the query. */
function setupTitleTree() {
    const project = Project.createInstance("Test");
    const page = project.addPage("Search and Commands", "user");
    const child = (page.items as Items).addNode("user");
    child.updateText("command palette");
    return { project, page, child };
}

describe("search utilities", () => {
    it("finds matches case insensitive", () => {
        const { page } = setupTree();
        const results = searchItems(page as Item, "hello", {});
        const total = results.reduce((c, r) => c + r.matches.length, 0);
        expect(total).toBe(2);
    });

    it("respects case sensitivity", () => {
        const { page } = setupTree();
        const results = searchItems(page as Item, "hello", { caseSensitive: true });
        const total = results.reduce((c, r) => c + r.matches.length, 0);
        expect(total).toBe(1);
    });

    it("replace functions modify text", () => {
        const { page, child1 } = setupTree();
        const replaced = replaceFirst(page as Item, "hello", "hi");
        expect(replaced).toBe(true);
        expect(child1.text.includes("hi")).toBe(true);
        replaceAll(page as Item, "world", "earth");
        expect(child1.text.includes("earth")).toBe(true);
    });
});

describe("page title protection (skipRoot)", () => {
    it("replaceFirst leaves the page title untouched and moves on to the body", () => {
        const { page, child } = setupTitleTree();
        const replaced = replaceFirst(page as Item, "command", "", { skipRoot: true });
        expect(replaced).toBe(true);
        expect(page.text.toString()).toBe("Search and Commands");
        expect(child.text.toString()).toBe(" palette");
    });

    it("replaceAll leaves the page title untouched", () => {
        const { page, child } = setupTitleTree();
        const count = replaceAll(page as Item, "command", "", { skipRoot: true });
        expect(count).toBe(1);
        expect(page.text.toString()).toBe("Search and Commands");
        expect(child.text.toString()).toBe(" palette");
    });

    it("rewrites the page title when skipRoot is not set", () => {
        const { page } = setupTitleTree();
        expect(replaceFirst(page as Item, "command", "")).toBe(true);
        expect(page.text.toString()).toBe("Search and s");
    });

    it("findFirstReplaceTarget reports a title hit as the root without modifying it", () => {
        const { page } = setupTitleTree();
        const target = findFirstReplaceTarget(page as Item, "command", "");
        expect(target?.isRoot).toBe(true);
        expect(target?.newText).toBe("Search and s");
        expect(page.text.toString()).toBe("Search and Commands");

        const bodyTarget = findFirstReplaceTarget(page as Item, "command", "", { skipRoot: true });
        expect(bodyTarget?.isRoot).toBe(false);
        expect(bodyTarget?.newText).toBe(" palette");
    });

    it("project-level helpers skip page titles by default", () => {
        const { project, page, child } = setupTitleTree();
        replaceFirstInProject(project, "command", "");
        expect(page.text.toString()).toBe("Search and Commands");
        expect(child.text.toString()).toBe(" palette");

        child.updateText("command palette");
        replaceAllInProject(project, "command", "");
        expect(page.text.toString()).toBe("Search and Commands");
        expect(child.text.toString()).toBe(" palette");
    });

    it("project-level helpers rename pages when skipRoot is explicitly disabled", () => {
        const { project, page } = setupTitleTree();
        replaceFirstInProject(project, "command", "", { skipRoot: false });
        expect(page.text.toString()).toBe("Search and s");
    });
});
