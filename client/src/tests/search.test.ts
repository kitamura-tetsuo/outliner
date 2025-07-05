import { describe, expect, it } from "vitest";
import { replaceAll, replaceFirst, searchItems } from "../lib/search";
import { Item, Items, Project } from "../schema/app-schema";

function setupTree() {
    const project = Project.createInstance("Test");
    const page = project.addPage("root", "user");
    const child1 = page.items.addNode("user");
    child1.updateText("hello world");
    const child2 = page.items.addNode("user");
    child2.updateText("Hello World");
    return { page, child1, child2 };
}

describe("search utilities", () => {
    it("finds matches case insensitive", () => {
        const { page } = setupTree();
        const results = searchItems(page, "hello", {});
        const total = results.reduce((c, r) => c + r.matches.length, 0);
        expect(total).toBe(2);
    });

    it("respects case sensitivity", () => {
        const { page } = setupTree();
        const results = searchItems(page, "hello", { caseSensitive: true });
        const total = results.reduce((c, r) => c + r.matches.length, 0);
        expect(total).toBe(1);
    });

    it("replace functions modify text", () => {
        const { page, child1 } = setupTree();
        const replaced = replaceFirst(page, "hello", "hi");
        expect(replaced).toBe(true);
        expect(child1.text.includes("hi")).toBe(true);
        replaceAll(page, "world", "earth");
        expect(child1.text.includes("earth")).toBe(true);
    });
});
