import { describe, expect, it } from "vitest";
import { buildGraph } from "../../../utils/graphUtils";

describe("graphUtils", () => {
    describe("buildGraph", () => {
        it("should return empty nodes and links when pagesMaybe is null", () => {
            const result = buildGraph(null, "Project1");
            expect(result).toEqual({ nodes: [], links: [] });
        });

        it("should parse array of nodes without links", () => {
            const pages = [
                { id: "p1", text: "Page One" },
                { id: "p2", text: "Page Two" },
            ];
            const result = buildGraph(pages, "Project1");
            expect(result.nodes).toHaveLength(2);
            expect(result.nodes[0]).toEqual({ id: "p1", name: "Page One" });
            expect(result.nodes[1]).toEqual({ id: "p2", name: "Page Two" });
            expect(result.links).toHaveLength(0);
        });

        it("should create links when page text contains [target]", () => {
            const pages = [
                { id: "p1", text: "Hello [Page Two]" },
                { id: "p2", text: "Page Two" },
            ];
            const result = buildGraph(pages, "Project1");
            expect(result.nodes).toHaveLength(2);
            expect(result.links).toHaveLength(1);
            expect(result.links[0]).toEqual({ source: "p1", target: "p2" });
        });

        it("should handle full project links", () => {
            const pages = [
                { id: "p1", text: "Go to [/project1/page two]" },
                { id: "p2", text: "Page Two" },
            ];
            const result = buildGraph(pages, "Project1");
            expect(result.links).toHaveLength(1);
            expect(result.links[0]).toEqual({ source: "p1", target: "p2" });
        });

        it("should safely handle objects missing id or text", () => {
            const pages = [
                { id: "p1" },
                { text: "Page Two" }, // Missing ID
            ];
            const result = buildGraph(pages, "Project1");
            expect(result.nodes).toHaveLength(2);
        });

        it("should extract text from an object with toString method when text property is missing", () => {
            const pages = [
                { id: "p1", toString: () => "Stringified Page One" },
                { id: "p2", text: { toString: () => "Stringified Text Obj" } },
            ];
            const result = buildGraph(pages, "Project1");
            expect(result.nodes[0].name).toBe("Stringified Page One");
            expect(result.nodes[1].name).toBe("Stringified Text Obj");
        });

        it("should handle non-array iterables via toArray fallback", () => {
            // Using a Set to test `iterateItems` fallback handling
            const pages = new Set([
                { id: "p1", text: "Page One" },
                { id: "p2", text: "Page Two" },
            ]);
            const result = buildGraph(pages, "Project1");
            expect(result.nodes).toHaveLength(2);
        });

        it("should handle text value that is a raw string", () => {
            const pages = [
                { id: "p1", text: "Raw String" },
                "Just A String Node",
            ];
            const result = buildGraph(pages, "Project1");
            expect(result.nodes).toHaveLength(2);
            expect(result.nodes[1].name).toBe("Just A String Node");
        });

        it("should gracefully catch errors during toArray iteration", () => {
            const badIterable = {
                get [Symbol.iterator]() {
                    throw new Error("Iteration failed");
                },
            };
            const result = buildGraph(badIterable, "Project1");
            expect(result.nodes).toHaveLength(0);
        });

        it("should gracefully catch errors during getText extraction", () => {
            const badObj = {
                id: "p1",
                get text() {
                    throw new Error("Property access failed");
                },
            };
            const pages = [badObj];
            const result = buildGraph(pages, "Project1");
            // should fallback to String(v) -> "[object Object]"
            expect(result.nodes).toHaveLength(1);
            expect(result.nodes[0].name).toBe("[object Object]");
        });
    });
});
