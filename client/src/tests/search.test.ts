import { Project } from "@common/schema/app-schema";
import { replaceAll, replaceFirst, searchItems } from "@common/search";
import { describe, expect, it } from "vitest";

function setupTree() {
    const project = Project.createInstance("Test");
    const page = project.addPage("root", "user");
    const child1 = ((page as any).items as any).addNode("user");
    child1.updateText("hello world");
    const child2 = ((page as any).items as any).addNode("user");
    child2.updateText("Hello World");
    return { page, child1, child2 };
}

describe("search utilities", () => {
    it("finds matches case insensitive", () => {
        const { page } = setupTree();
        const results = searchItems(page as any, "hello", {});
        const total = results.reduce((c, r) => c + r.matches.length, 0);
        expect(total).toBe(2);
    });

    it("respects case sensitivity", () => {
        const { page } = setupTree();
        const results = searchItems(page as any, "hello", { caseSensitive: true });
        const total = results.reduce((c, r) => c + r.matches.length, 0);
        expect(total).toBe(1);
    });

    it("replace functions modify text", () => {
        const { page, child1 } = setupTree();
        const replaced = replaceFirst(page as any, "hello", "hi");
        expect(replaced).toBe(true);
        expect(child1.text.includes("hi")).toBe(true);
        replaceAll(page as any, "world", "earth");
        expect(child1.text.includes("earth")).toBe(true);
    });
});
