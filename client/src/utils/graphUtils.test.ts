import { describe, expect, it } from "vitest";
import { buildGraph } from "./graphUtils";

describe("buildGraph", () => {
    it("should link pages correctly", () => {
        const pages = [
            { id: "1", text: "Page One", items: [{ text: "Link to [Page Two]" }] },
            { id: "2", text: "Page Two" },
        ];
        const { nodes, links } = buildGraph(pages, "myproject");
        expect(nodes).toHaveLength(2);
        expect(links).toHaveLength(1);
        expect(links[0]).toEqual({ source: "1", target: "2" });
    });

    it("should handle project-absolute links", () => {
        const pages = [
            { id: "1", text: "Page One", items: [{ text: "Link to [/myproject/Page Two]" }] },
            { id: "2", text: "Page Two" },
        ];
        const { nodes, links } = buildGraph(pages, "myproject");
        expect(links).toHaveLength(1);
        expect(links[0]).toEqual({ source: "1", target: "2" });
    });

    it("should be case insensitive", () => {
        const pages = [
            { id: "1", text: "Page One", items: [{ text: "Link to [page two]" }] },
            { id: "2", text: "Page Two" },
        ];
        const { links } = buildGraph(pages, "myproject");
        expect(links).toHaveLength(1);
    });

    it("should handle special characters in page names", () => {
        const pages = [
            { id: "1", text: "Start", items: [{ text: "Link to [Page (Special)?+]" }] },
            { id: "2", text: "Page (Special)?+" },
        ];
        const { links } = buildGraph(pages, "myproject");
        expect(links).toHaveLength(1);
    });

    it("should ignore self links", () => {
        const pages = [
            { id: "1", text: "Page One", items: [{ text: "Link to [Page One]" }] },
        ];
        const { links } = buildGraph(pages, "myproject");
        expect(links).toHaveLength(0);
    });

    it("should handle items array mixed types", () => {
        const pages = [
            { id: "1", text: "Page One", items: ["Link to [Page Two]"] }, // string items
            { id: "2", text: "Page Two" },
        ];
        const { links } = buildGraph(pages, "myproject");
        expect(links).toHaveLength(1);
    });
});
