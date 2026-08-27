import { afterEach, describe, expect, it } from "vitest";
import { DRAG_SESSION_CLEAR_EVENT, onDragSessionClear } from "./dragSessionCleanup";

describe("dragSessionCleanup", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("broadcasts once a native drop is dispatched anywhere in the document", async () => {
        let calls = 0;
        const unsubscribe = onDragSessionClear(() => calls++);

        window.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        expect(calls).toBe(0);

        await Promise.resolve();
        expect(calls).toBe(1);

        unsubscribe();
    });

    it("broadcasts once a native dragend is dispatched anywhere in the document", async () => {
        let calls = 0;
        const unsubscribe = onDragSessionClear(() => calls++);

        window.dispatchEvent(new Event("dragend", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(calls).toBe(1);

        unsubscribe();
    });

    it("still fires even when a bubble-phase handler calls stopPropagation on the drop", async () => {
        let calls = 0;
        const unsubscribe = onDragSessionClear(() => calls++);

        const target = document.createElement("div");
        document.body.appendChild(target);
        target.addEventListener("drop", (event) => event.stopPropagation());

        target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(calls).toBe(1);

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
        let calls = 0;
        const unsubscribe = onDragSessionClear(() => calls++);
        unsubscribe();

        window.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(calls).toBe(0);
    });

    it("notifies every registered callback", async () => {
        let firstCalls = 0;
        let secondCalls = 0;
        const unsubscribeFirst = onDragSessionClear(() => firstCalls++);
        const unsubscribeSecond = onDragSessionClear(() => secondCalls++);

        window.dispatchEvent(new Event("dragend", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect(firstCalls).toBe(1);
        expect(secondCalls).toBe(1);

        unsubscribeFirst();
        unsubscribeSecond();
    });

    it("exposes the broadcast event name so a consumer could listen directly if needed", () => {
        expect(DRAG_SESSION_CLEAR_EVENT).toBe("outliner:drag-session-clear");
    });
});
