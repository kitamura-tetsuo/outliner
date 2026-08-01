import { afterEach, describe, expect, it } from "vitest";
import { BLOCK_DND_OWNER_ATTRIBUTE, BLOCK_DND_TYPE_ATTRIBUTE, isBlockOwnedDragEvent } from "./blockDndOwnership";

const OWN_TYPE = "application/x-block-payload";

/** Minimal stand-in for `DataTransfer`, which jsdom does not implement. */
function dragEventWithTypes(types: string[]): Event {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types } });
    return event;
}

describe("isBlockOwnedDragEvent", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    /** An item hosting a block; `requiredType` narrows the block's ownership when given. */
    function buildTree(requiredType?: string): { outside: HTMLElement; owner: HTMLElement; inside: HTMLElement; } {
        const item = document.createElement("div");
        const outside = document.createElement("span");
        const owner = document.createElement("div");
        owner.setAttribute(BLOCK_DND_OWNER_ATTRIBUTE, "block");
        if (requiredType !== undefined) owner.setAttribute(BLOCK_DND_TYPE_ATTRIBUTE, requiredType);
        const inside = document.createElement("span");

        owner.appendChild(inside);
        item.append(outside, owner);
        document.body.appendChild(item);
        return { outside, owner, inside };
    }

    describe("a block that claims every drag inside it", () => {
        it("is true for a target nested inside the block", () => {
            const { inside } = buildTree();
            const event = new Event("drop", { bubbles: true });
            inside.dispatchEvent(event);
            expect(isBlockOwnedDragEvent(event)).toBe(true);
        });

        it("is true for the owner element itself", () => {
            const { owner } = buildTree();
            const event = new Event("drop", { bubbles: true });
            owner.dispatchEvent(event);
            expect(isBlockOwnedDragEvent(event)).toBe(true);
        });

        it("is false for a target outside any owning block", () => {
            const { outside } = buildTree();
            const event = new Event("drop", { bubbles: true });
            outside.dispatchEvent(event);
            expect(isBlockOwnedDragEvent(event)).toBe(false);
        });

        it("is false for a synthetic event with no element target", () => {
            const event = new CustomEvent("synthetic-drop", { detail: { targetItemId: "item-1" } });
            expect(isBlockOwnedDragEvent(event)).toBe(false);
        });
    });

    describe("a block that claims only its own payload", () => {
        it("is true when the drag carries the declared type", () => {
            const { inside } = buildTree(OWN_TYPE);
            const event = dragEventWithTypes(["text/plain", OWN_TYPE]);
            inside.dispatchEvent(event);
            expect(isBlockOwnedDragEvent(event)).toBe(true);
        });

        it("is false for an unrelated drag landing inside the block", () => {
            const { inside } = buildTree(OWN_TYPE);
            // A file or outliner-item drop over a table cell still belongs to the host item.
            const event = dragEventWithTypes(["Files"]);
            inside.dispatchEvent(event);
            expect(isBlockOwnedDragEvent(event)).toBe(false);
        });

        it("is false when the drag carries no DataTransfer at all", () => {
            const { inside } = buildTree(OWN_TYPE);
            const event = new Event("drop", { bubbles: true });
            inside.dispatchEvent(event);
            expect(isBlockOwnedDragEvent(event)).toBe(false);
        });

        it("falls back to claiming every drag when the declared type is empty", () => {
            const { inside } = buildTree("");
            const event = dragEventWithTypes(["Files"]);
            inside.dispatchEvent(event);
            expect(isBlockOwnedDragEvent(event)).toBe(true);
        });
    });
});
