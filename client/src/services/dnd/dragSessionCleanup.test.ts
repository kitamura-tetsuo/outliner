import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAG_SESSION_CLEAR_EVENT, onDragSessionClear } from "./dragSessionCleanup";

describe("dragSessionCleanup", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("broadcasts once a native drop is dispatched anywhere in the document", async () => {
        const callback = vi.fn();
        const unsubscribe = onDragSessionClear(callback);

        window.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        expect(callback).not.toHaveBeenCalled();

        await Promise.resolve();
        expect(callback).toHaveBeenCalledTimes(1);

        unsubscribe();
    });

    it("broadcasts once a native dragend is dispatched anywhere in the document", async () => {
        const callback = vi.fn();
        const unsubscribe = onDragSessionClear(callback);

        window.dispatchEvent(new Event("dragend", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(callback).toHaveBeenCalledTimes(1);

        unsubscribe();
    });

    it("still fires even when a bubble-phase handler calls stopPropagation on the drop", async () => {
        const callback = vi.fn();
        const unsubscribe = onDragSessionClear(callback);

        const target = document.createElement("div");
        document.body.appendChild(target);
        target.addEventListener("drop", (event) => event.stopPropagation());

        target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(callback).toHaveBeenCalledTimes(1);

        unsubscribe();
    });

    it("defers the broadcast past the dispatching drop handler's own synchronous work", () => {
        const order: string[] = [];
        const unsubscribe = onDragSessionClear(() => order.push("cleared"));

        const target = document.createElement("div");
        document.body.appendChild(target);
        target.addEventListener("drop", () => order.push("own handler"));

        target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        // The broadcast is a microtask: nothing has run yet synchronously.
        expect(order).toEqual(["own handler"]);

        unsubscribe();
    });

    it("stops calling a callback once unsubscribed", async () => {
        const callback = vi.fn();
        const unsubscribe = onDragSessionClear(callback);
        unsubscribe();

        window.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(callback).not.toHaveBeenCalled();
    });

    it("notifies every registered callback", async () => {
        const first = vi.fn();
        const second = vi.fn();
        const unsubscribeFirst = onDragSessionClear(first);
        const unsubscribeSecond = onDragSessionClear(second);

        window.dispatchEvent(new Event("dragend", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);

        unsubscribeFirst();
        unsubscribeSecond();
    });

    it("exposes the broadcast event name so a consumer could listen directly if needed", () => {
        expect(DRAG_SESSION_CLEAR_EVENT).toBe("outliner:drag-session-clear");
    });
});
