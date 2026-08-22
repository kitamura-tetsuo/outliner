import { beforeEach, describe, expect, it } from "vitest";
import { VISUAL_NODE_ROOT_ATTRIBUTE } from "../selectionGeometry";
import {
    isBlockOwnedInteraction,
    isVisualRow,
    outermostVisualNodeId,
    outlineSelectionSurfaceItemId,
    readOutlineRows,
    VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE,
} from "./outlineSelectionDom";

/** A Text row, a Grid row and a Layout holding a Calendar, rendered as the app renders them. */
function renderOutline() {
    document.body.innerHTML = `
        <div class="outliner">
            <div class="outliner-item" data-item-id="text" data-node-kind="text">
                <span class="item-text">Alpha text</span>
            </div>
            <div class="outliner-item" data-item-id="grid" data-node-kind="grid">
                <div class="component-wrapper" ${VISUAL_NODE_ROOT_ATTRIBUTE}="grid">
                    <div ${VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE}="grid" id="grid-surface"></div>
                    <table><tbody><tr><td id="grid-cell" role="gridcell">7</td></tr></tbody></table>
                </div>
            </div>
            <div class="outliner-item" data-item-id="layout" data-node-kind="layout">
                <div class="component-wrapper" ${VISUAL_NODE_ROOT_ATTRIBUTE}="layout">
                    <div ${VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE}="layout" id="layout-surface"></div>
                    <div class="layout-cell" data-item-id="child" data-node-kind="calendar">
                        <div class="component-wrapper" ${VISUAL_NODE_ROOT_ATTRIBUTE}="child">
                            <div ${VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE}="child" id="child-surface"></div>
                            <button id="child-button">Today</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}

const at = (id: string) => document.getElementById(id)!;

describe("outlineSelectionDom", () => {
    beforeEach(renderOutline);

    describe("outermostVisualNodeId", () => {
        it("resolves a block's own content to that block", () => {
            expect(outermostVisualNodeId(at("grid-cell"))).toBe("grid");
        });

        it("resolves a nested block to its container, which is the outline's row", () => {
            expect(outermostVisualNodeId(at("child-button"))).toBe("layout");
        });

        it("finds no block outside one", () => {
            expect(outermostVisualNodeId(document.querySelector(".item-text"))).toBeUndefined();
            expect(outermostVisualNodeId(undefined)).toBeUndefined();
        });
    });

    describe("outlineSelectionSurfaceItemId", () => {
        it("names the block whose surface was pressed", () => {
            expect(outlineSelectionSurfaceItemId(at("grid-surface"))).toBe("grid");
        });

        it("names the container when a nested block's surface is pressed", () => {
            expect(outlineSelectionSurfaceItemId(at("child-surface"))).toBe("layout");
        });

        it("names nothing for a gesture on the block's own content", () => {
            expect(outlineSelectionSurfaceItemId(at("grid-cell"))).toBeUndefined();
            expect(outlineSelectionSurfaceItemId(at("child-button"))).toBeUndefined();
        });
    });

    describe("isBlockOwnedInteraction", () => {
        it("leaves a block's own content to the block", () => {
            expect(isBlockOwnedInteraction(at("grid-cell"))).toBe(true);
            expect(isBlockOwnedInteraction(at("child-button"))).toBe(true);
        });

        it("claims the outline's own selection surface", () => {
            expect(isBlockOwnedInteraction(at("grid-surface"))).toBe(false);
            expect(isBlockOwnedInteraction(at("child-surface"))).toBe(false);
        });

        it("says nothing about gestures outside any block", () => {
            expect(isBlockOwnedInteraction(document.querySelector(".item-text"))).toBe(false);
        });
    });

    describe("isVisualRow", () => {
        it("reads the kind each row publishes about itself", () => {
            expect(isVisualRow("text")).toBe(false);
            expect(isVisualRow("grid")).toBe(true);
            expect(isVisualRow("layout")).toBe(true);
        });

        it("treats a row the outline no longer renders as no block", () => {
            expect(isVisualRow("gone")).toBe(false);
        });
    });

    describe("readOutlineRows", () => {
        it("reads the outline's rows in order, with the kind each publishes", () => {
            expect(readOutlineRows()).toEqual([
                { itemId: "text", isVisual: false, textLength: "Alpha text".length },
                { itemId: "grid", isVisual: true, textLength: 0 },
                { itemId: "layout", isVisual: true, textLength: 0 },
            ]);
        });

        it("leaves a Layout's children out: they are part of their container's picture", () => {
            expect(readOutlineRows().map(row => row.itemId)).not.toContain("child");
        });
    });
});
