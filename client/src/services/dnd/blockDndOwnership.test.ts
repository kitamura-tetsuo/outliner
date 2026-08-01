import { afterEach, describe, expect, it } from "vitest";
import { BLOCK_DND_OWNER_ATTRIBUTE, isBlockOwnedDragEvent } from "./blockDndOwnership";

describe("isBlockOwnedDragEvent", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    function buildTree(): { outside: HTMLElement; owner: HTMLElement; inside: HTMLElement; } {
        const item = document.createElement("div");
        const outside = document.createElement("span");
        const owner = document.createElement("div");
        owner.setAttribute(BLOCK_DND_OWNER_ATTRIBUTE, "yjstable");
        const inside = document.createElement("span");

        owner.appendChild(inside);
        item.append(outside, owner);
        document.body.appendChild(item);
        return { outside, owner, inside };
    }

    it("is true for a target nested inside a block that owns its drags", () => {
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
