import { beforeEach, describe, expect, it } from "vitest";
import { KeyEventHandler } from "./KeyEventHandler";

describe("KeyEventHandler DOM methods", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div class="outliner">
                <div class="item-container">
                    <div class="outliner-item" data-item-id="item1">
                        <div class="item-text">Text 1</div>
                    </div>
                </div>
                <div class="item-container">
                    <div class="outliner-item" data-item-id="item2">
                        <div class="item-text">Text 2</div>
                    </div>
                </div>
                <div class="item-container">
                    <div class="outliner-item" data-item-id="item3">
                        <div class="item-text">Text 3</div>
                    </div>
                </div>
            </div>
        `;
    });

    it("getItemText returns correct text", () => {
        // @ts-expect-error - accessing private method for test
        expect(KeyEventHandler.getItemText("item1")).toBe("Text 1");
    });

    it("getAdjacentItem works", () => {
        // @ts-expect-error - accessing private method for test
        const next = KeyEventHandler.getAdjacentItem("item1", "next");
        expect(next?.id).toBe("item2");
    });

    it("getItemsBetween works", () => {
        // @ts-expect-error - accessing private method for test
        const range = KeyEventHandler.getItemsBetween("item1", "item3");
        expect(range.map(i => i.id)).toEqual(["item1", "item2", "item3"]);
    });
});
