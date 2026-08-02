import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getClickPosition, pixelPositionToTextPosition } from "./textUtils";

let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;
let originalGetComputedStyle: typeof window.getComputedStyle;

interface CaretPosition {
    offsetNode: Node;
    offset: number;
}

type DocumentWithCaret = Document & {
    caretPositionFromPoint?: (x: number, y: number, options?: unknown) => CaretPosition | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

beforeAll(() => {
    // Set DOM globally
    const dom = new JSDOM("<!DOCTYPE html><body></body>");
    const globalAny = global as typeof globalThis & {
        window?: Window;
        document?: Document;
        Element?: typeof Element;
        HTMLElement?: typeof HTMLElement;
        Node?: typeof Node;
    };
    globalAny.window = dom.window as unknown as Window & typeof globalThis;
    globalAny.document = dom.window.document;
    globalAny.Element = dom.window.Element;
    globalAny.HTMLElement = dom.window.HTMLElement;
    globalAny.Node = dom.window.Node;
    // Mock getBoundingClientRect: textContent length * 10px
    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
        const width = (this.textContent?.length || 0) * 10;
        return { width, left: 0, top: 0, right: width, bottom: 0, height: 0, x: 0, y: 0, toJSON() {} };
    };
    // Mock necessary properties of getComputedStyle
    originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = () => ({
        fontFamily: "",
        fontSize: "",
        fontWeight: "",
        letterSpacing: "",
    } as unknown as CSSStyleDeclaration);
});

afterAll(() => {
    // Restore mocks
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    window.getComputedStyle = originalGetComputedStyle;
});

describe("getClickPosition", () => {
    it("should return nearest index based on click x coordinate", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        // Click x=25 => 10*2=20 and 10*3=30 are closest (diff 5), returns 2 which is found first
        const offset = getClickPosition(div, { clientX: 25, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(2);

        document.body.removeChild(div);
    });

    it("should use caretPositionFromPoint if available and valid", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const mockNode = document.createTextNode(content);
        const doc = document as DocumentWithCaret;
        doc.caretPositionFromPoint = vi.fn((x, y) => {
            if (x === 15 && y === 0) {
                return { offsetNode: mockNode, offset: 3 };
            }
            return null;
        });

        // Mock createRange because the method uses doc.createRange()
        doc.createRange = vi.fn(
            () => ({
                setStart: vi.fn(),
                collapse: vi.fn(),
                startContainer: { nodeType: Node.TEXT_NODE },
                startOffset: 3,
            } as unknown as Range),
        );

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(3);

        delete doc.caretPositionFromPoint;
        delete (doc as unknown as { createRange?: unknown; }).createRange;
        document.body.removeChild(div);
    });

    it("should use fallback if range from caretPositionFromPoint startContainer is not a text node", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const mockNode = document.createTextNode(content);
        const doc = document as DocumentWithCaret;
        doc.caretPositionFromPoint = vi.fn((x, y) => {
            if (x === 15 && y === 0) {
                return { offsetNode: mockNode, offset: 3 };
            }
            return null;
        });

        // Mock createRange because the method uses doc.createRange()
        doc.createRange = vi.fn(
            () => ({
                setStart: vi.fn(),
                collapse: vi.fn(),
                startContainer: { nodeType: Node.ELEMENT_NODE },
                startOffset: 3,
            } as unknown as Range),
        );

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(1);

        delete doc.caretPositionFromPoint;
        delete (doc as unknown as { createRange?: unknown; }).createRange;
        document.body.removeChild(div);
    });

    it("should fall back if caretPositionFromPoint returns null", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const doc = document as DocumentWithCaret;
        doc.caretPositionFromPoint = vi.fn((_x, _y) => {
            return null;
        });

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(1);

        delete doc.caretPositionFromPoint;
        document.body.removeChild(div);
    });

    it("should use caretRangeFromPoint if available and valid", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const doc = document as DocumentWithCaret;
        doc.caretRangeFromPoint = vi.fn((x, y) => {
            if (x === 15 && y === 0) {
                return {
                    startContainer: { nodeType: Node.TEXT_NODE },
                    startOffset: 2,
                } as unknown as Range;
            }
            return null;
        });

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(2);

        delete doc.caretRangeFromPoint;
        document.body.removeChild(div);
    });

    it("should fall back if caretRangeFromPoint returns null", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const doc = document as DocumentWithCaret;
        doc.caretRangeFromPoint = vi.fn((_x, _y) => {
            return null;
        });

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(1);

        delete doc.caretRangeFromPoint;
        document.body.removeChild(div);
    });

    it("should fall back if textEl is falsy", () => {
        const content = "abcdef";

        // When textEl is falsy, getClickPosition doesn't use Caret API.
        // It relies on getBoundingClientRect() which requires a real DOM element.
        // However we can pass a dummy that has getBoundingClientRect
        const dummyEl = "" as unknown as HTMLElement;

        const doc = document as DocumentWithCaret;
        doc.caretRangeFromPoint = vi.fn();
        doc.caretPositionFromPoint = vi.fn();

        try {
            getClickPosition(dummyEl, { clientX: 15, clientY: 0 } as MouseEvent, content);
        } catch (_e) {
            // It will crash on textEl.getBoundingClientRect() since textEl is falsy (string),
            // but we just want to verify doc.caretRangeFromPoint is not called.
        }

        expect(doc.caretRangeFromPoint).not.toHaveBeenCalled();
        expect(doc.caretPositionFromPoint).not.toHaveBeenCalled();

        delete doc.caretRangeFromPoint;
        delete doc.caretPositionFromPoint;
    });

    it("should fallback gracefully if doc.caretRangeFromPoint is undefined", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const doc = document as DocumentWithCaret;
        const originalCaretRangeFromPoint = doc.caretRangeFromPoint;
        const originalCaretPositionFromPoint = doc.caretPositionFromPoint;

        doc.caretRangeFromPoint = undefined;
        doc.caretPositionFromPoint = undefined;

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(1);

        doc.caretRangeFromPoint = originalCaretRangeFromPoint;
        doc.caretPositionFromPoint = originalCaretPositionFromPoint;
        document.body.removeChild(div);
    });

    it("should use fallback if range from caretRangeFromPoint startContainer is not a text node", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const doc = document as DocumentWithCaret;
        doc.caretRangeFromPoint = vi.fn((x, y) => {
            if (x === 15 && y === 0) {
                return {
                    startContainer: { nodeType: Node.ELEMENT_NODE },
                    startOffset: 2,
                } as unknown as Range;
            }
            return null;
        });

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        // Fallback calculation: 15 -> 10*1=10, 10*2=20 (diff 5) -> returns 1
        expect(offset).toBe(1);

        delete doc.caretRangeFromPoint;
        document.body.removeChild(div);
    });

    it("should handle larger offsets than content length gracefully", () => {
        const content = "abcdef"; // length 6
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const doc = document as DocumentWithCaret;
        doc.caretRangeFromPoint = vi.fn((x, y) => {
            if (x === 15 && y === 0) {
                return {
                    startContainer: { nodeType: Node.TEXT_NODE },
                    startOffset: 10,
                } as unknown as Range;
            }
            return null;
        });

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        // It clamps to content length
        expect(offset).toBe(6);

        delete doc.caretRangeFromPoint;
        document.body.removeChild(div);
    });

    it("should handle negative offsets gracefully", () => {
        const content = "abcdef"; // length 6
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const doc = document as DocumentWithCaret;
        doc.caretRangeFromPoint = vi.fn((x, y) => {
            if (x === 15 && y === 0) {
                return {
                    startContainer: { nodeType: Node.TEXT_NODE },
                    startOffset: -5,
                } as unknown as Range;
            }
            return null;
        });

        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        // It clamps to 0
        expect(offset).toBe(0);

        delete doc.caretRangeFromPoint;
        document.body.removeChild(div);
    });

    it("should handle exception in range setStart", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        const mockNode = document.createTextNode(content);
        const doc = document as DocumentWithCaret;
        doc.caretPositionFromPoint = vi.fn((x, y) => {
            if (x === 15 && y === 0) {
                return { offsetNode: mockNode, offset: 100 };
            }
            return null;
        });

        doc.createRange = vi.fn(
            () => ({
                setStart: vi.fn(() => {
                    throw new Error("Invalid node offset");
                }),
                collapse: vi.fn(),
            } as unknown as Range),
        );

        // Should fall back to the bounding client rect method
        const offset = getClickPosition(div, { clientX: 15, clientY: 0 } as MouseEvent, content);
        // Fallback calculation: 15 -> 10*1=10, 10*2=20 (diff 5) -> returns 1
        expect(offset).toBe(1);

        delete doc.caretPositionFromPoint;
        delete (doc as unknown as { createRange?: unknown; }).createRange;
        document.body.removeChild(div);
    });
});

describe("pixelPositionToTextPosition", () => {
    it("should map screenX to correct text offset", () => {
        const content = "ABCDEFG";
        const container = document.createElement("div");
        const span = document.createElement("span");
        span.className = "item-text";
        span.textContent = content;
        container.appendChild(span);
        document.body.appendChild(container);

        // screenX=55 => 10*5=50 and 10*6=60 have minimum diff 5 => 5
        const offset = pixelPositionToTextPosition(55, container);
        expect(offset).toBe(5);

        document.body.removeChild(container);
    });

    it("should map to 0 if element has no textContent", () => {
        const container = document.createElement("div");
        const span = document.createElement("span");
        span.className = "item-text";
        container.appendChild(span);
        document.body.appendChild(container);

        const offset = pixelPositionToTextPosition(55, container);
        expect(offset).toBe(0);

        document.body.removeChild(container);
    });

    it("should return 0 if no item-text element is found", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);

        const offset = pixelPositionToTextPosition(55, container);
        expect(offset).toBe(0);

        document.body.removeChild(container);
    });
});
