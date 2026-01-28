import { describe, expect, it } from "vitest";
import { buildGraph } from "./graphUtils";

describe("buildGraph", () => {
    it("detects simple links", () => {
        const pages = [
            { id: "1", text: "Page1", items: [{ text: "Link to [Page2]" }] },
            { id: "2", text: "Page2", items: [] },
        ];
        const { links } = buildGraph(pages, "TestProject");
        expect(links).toContainEqual({ source: "1", target: "2" });
        expect(links.length).toBe(1);
    });

    it("detects project links", () => {
        const pages = [
            { id: "1", text: "Page1", items: [{ text: "Link to [/TestProject/Page2]" }] },
            { id: "2", text: "Page2", items: [] },
        ];
        const { links } = buildGraph(pages, "TestProject");
        expect(links).toContainEqual({ source: "1", target: "2" });
    });

    it("is case insensitive", () => {
        const pages = [
            { id: "1", text: "Page1", items: [{ text: "Link to [page2]" }] },
            { id: "2", text: "Page2", items: [] },
        ];
        const { links } = buildGraph(pages, "TestProject");
        expect(links).toContainEqual({ source: "1", target: "2" });
    });

    it("handles special characters", () => {
        const pages = [
            { id: "1", text: "Page1", items: [{ text: "Link to [Page.With.Dots]" }] },
            { id: "2", text: "Page.With.Dots", items: [] },
        ];
        const { links } = buildGraph(pages, "TestProject");
        expect(links).toContainEqual({ source: "1", target: "2" });
    });

    it("does not link to self", () => {
        const pages = [
            { id: "1", text: "Page1", items: [{ text: "Link to [Page1]" }] },
        ];
        const { links } = buildGraph(pages, "TestProject");
        expect(links).toEqual([]);
    });

    it("handles multiple links", () => {
        const pages = [
            { id: "1", text: "Page1", items: [{ text: "[Page2] and [Page3]" }] },
            { id: "2", text: "Page2", items: [] },
            { id: "3", text: "Page3", items: [] },
        ];
        const { links } = buildGraph(pages, "TestProject");
        expect(links).toContainEqual({ source: "1", target: "2" });
        expect(links).toContainEqual({ source: "1", target: "3" });
        expect(links.length).toBe(2);
    });
});
