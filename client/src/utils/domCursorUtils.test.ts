import { describe, expect, it } from "vitest";
import { calculateGlobalOffset } from "./domCursorUtils";

describe("calculateGlobalOffset", () => {
    it("calculates offset in simple text node", () => {
        const root = document.createElement("div");
        root.textContent = "Hello World";
        // DOM: <div>"Hello World"</div>

        const textNode = root.firstChild!;
        expect(calculateGlobalOffset(root, textNode, 5)).toBe(5); // "Hello| World"
    });

    it("calculates offset with multiple spans", () => {
        const root = document.createElement("div");
        // HTML: <span>Hello</span> <span>World</span>
        const span1 = document.createElement("span");
        span1.textContent = "Hello";
        const span2 = document.createElement("span");
        span2.textContent = "World";
        root.appendChild(span1);
        root.appendChild(document.createTextNode(" "));
        root.appendChild(span2);

        // root content: "Hello World"
        const span2Text = span2.firstChild!;

        // Offset at start of 'World' (index 6)
        expect(calculateGlobalOffset(root, span2Text, 0)).toBe(6);

        // Offset at 'W|orld' (index 7)
        expect(calculateGlobalOffset(root, span2Text, 1)).toBe(7);
    });

    it("calculates offset when container is an element", () => {
        const root = document.createElement("div");
        const span1 = document.createElement("span");
        span1.textContent = "A";
        const span2 = document.createElement("span");
        span2.textContent = "B";
        root.appendChild(span1);
        root.appendChild(span2);

        // Cursor between span1 and span2.
        // Container: root, Offset: 1.
        expect(calculateGlobalOffset(root, root, 1)).toBe(1);
    });

    it("calculates offset correctly with nested structure", () => {
        const root = document.createElement("div");
        // Structure: <span>[</span><strong>bold</strong><span>]</span>
        // Text: "[bold]"

        const span1 = document.createElement("span");
        span1.textContent = "[";

        const strong = document.createElement("strong");
        strong.textContent = "bold";

        const span2 = document.createElement("span");
        span2.textContent = "]";

        root.appendChild(span1);
        root.appendChild(strong);
        root.appendChild(span2);

        const boldText = strong.firstChild!;

        // Click inside 'bold' at index 2 ('bo|ld')
        // Global: '[' (1) + 'bo' (2) = 3.
        expect(calculateGlobalOffset(root, boldText, 2)).toBe(3);
    });
});
