import { describe, expect, it } from "vitest";
import {
    CALENDAR_COMPONENT_TYPE,
    canAcceptChild,
    canNodeHaveChildren,
    GRID_COMPONENT_TYPE,
    isAllowedKindWrite,
    isLayoutNode,
    isTextNode,
    isVisualLeafNode,
    isVisualNode,
    LAYOUT_COMPONENT_TYPE,
    nodeKindOf,
    nodeKindOfComponentType,
} from "../../src/services/outlineNodeKind.js";

const text = {};
const grid = { componentType: GRID_COMPONENT_TYPE };
const calendar = { componentType: CALENDAR_COMPONENT_TYPE };
const layout = { componentType: LAYOUT_COMPONENT_TYPE };

describe("outline node kinds (#5015)", () => {
    it("maps each stored discriminator to exactly one semantic kind", () => {
        expect(nodeKindOfComponentType(undefined)).toBe("text");
        expect(nodeKindOfComponentType(GRID_COMPONENT_TYPE)).toBe("grid");
        expect(nodeKindOfComponentType(CALENDAR_COMPONENT_TYPE)).toBe("calendar");
        expect(nodeKindOfComponentType(LAYOUT_COMPONENT_TYPE)).toBe("layout");
    });

    it("reads an unknown or unreadable discriminator as Text, the narrowest kind", () => {
        expect(nodeKindOfComponentType("chart-from-the-future")).toBe("text");
        expect(nodeKindOf(undefined)).toBe("text");
        expect(nodeKindOf({
            get componentType(): string {
                throw new Error("node deleted concurrently");
            },
        })).toBe("text");
    });

    it("classifies text, visual leaves and the Layout container", () => {
        expect(isTextNode(text)).toBe(true);
        expect(isVisualNode(text)).toBe(false);

        for (const node of [grid, calendar]) {
            expect(isTextNode(node)).toBe(false);
            expect(isVisualNode(node)).toBe(true);
            expect(isVisualLeafNode(node)).toBe(true);
            expect(isLayoutNode(node)).toBe(false);
        }

        expect(isVisualNode(layout)).toBe(true);
        expect(isVisualLeafNode(layout)).toBe(false);
        expect(isLayoutNode(layout)).toBe(true);
    });

    it("makes Grid and Calendar leaves, and Text and Layout containers", () => {
        expect(canNodeHaveChildren(text)).toBe(true);
        expect(canNodeHaveChildren(layout)).toBe(true);
        expect(canNodeHaveChildren(grid)).toBe(false);
        expect(canNodeHaveChildren(calendar)).toBe(false);
    });

    it("lets Text hold any kind, including a block under a heading", () => {
        expect(canAcceptChild(text, text)).toBe(true);
        expect(canAcceptChild(text, grid)).toBe(true);
        expect(canAcceptChild(text, calendar)).toBe(true);
        expect(canAcceptChild(text, layout)).toBe(true);
        // No parent means the page root, which behaves like a Text container.
        expect(canAcceptChild(undefined, layout)).toBe(true);
    });

    it("refuses every child under a Grid or Calendar leaf", () => {
        for (const parent of [grid, calendar]) {
            for (const child of [text, grid, calendar, layout]) {
                expect(canAcceptChild(parent, child)).toBe(false);
            }
        }
    });

    it("lets a Layout hold only visual leaves, so nested Layout stays invalid", () => {
        expect(canAcceptChild(layout, grid)).toBe(true);
        expect(canAcceptChild(layout, calendar)).toBe(true);
        expect(canAcceptChild(layout, text)).toBe(false);
        expect(canAcceptChild(layout, layout)).toBe(false);
    });

    it("allows a kind to be stamped on a blank node once, and never changed after", () => {
        expect(isAllowedKindWrite(undefined, GRID_COMPONENT_TYPE)).toBe(true);
        expect(isAllowedKindWrite(undefined, undefined)).toBe(true);
        expect(isAllowedKindWrite(GRID_COMPONENT_TYPE, GRID_COMPONENT_TYPE)).toBe(true);

        expect(isAllowedKindWrite(GRID_COMPONENT_TYPE, CALENDAR_COMPONENT_TYPE)).toBe(false);
        expect(isAllowedKindWrite(GRID_COMPONENT_TYPE, undefined)).toBe(false);
        expect(isAllowedKindWrite(LAYOUT_COMPONENT_TYPE, GRID_COMPONENT_TYPE)).toBe(false);
        expect(isAllowedKindWrite(CALENDAR_COMPONENT_TYPE, undefined)).toBe(false);
    });
});
