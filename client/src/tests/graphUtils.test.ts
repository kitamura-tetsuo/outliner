import { describe, expect, it } from "vitest";
import { buildGraph } from "../utils/graphUtils";

describe("buildGraph", () => {
    it("creates nodes and links from pages", () => {
        const pages = [
            { id: "1", text: "PageA", items: [{ text: "Link to [PageB]" }] },
            { id: "2", text: "PageB", items: [] },
        ];
        const { nodes, links } = buildGraph(pages, "");
        expect(nodes.length).toBe(2);
        expect(links.length).toBe(1);
        expect(links[0]).toEqual({ source: "1", target: "2" });
    });
});
