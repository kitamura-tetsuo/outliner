import { beforeEach, describe, expect, it } from "vitest";
import { isForeignInput, KeyEventHandler } from "./KeyEventHandler";

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

    it("leaves keyboard activation to a focused native dependency link", () => {
        const link = document.createElement("a");
        link.href = "/project/-/tables/table-b";
        document.querySelector(".outliner-item")!.append(link);
        link.focus();
        expect(isForeignInput(link)).toBe(true);
        const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
        link.addEventListener("keydown", event => KeyEventHandler.handleKeyDown(event));
        link.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(link);
        expect(document.querySelectorAll(".outliner-item")).toHaveLength(3);
    });

    it("getItemText returns correct text", () => {
        expect(KeyEventHandler.getItemText("item1")).toBe("Text 1");
    });

    it("getAdjacentItem works", () => {
        const next = KeyEventHandler.getAdjacentItem("item1", "next");
        expect(next?.id).toBe("item2");
    });

    it("getItemsBetween works", () => {
        const range = KeyEventHandler.getItemsBetween("item1", "item3");
        expect(range.map(i => i.id)).toEqual(["item1", "item2", "item3"]);
    });
});
