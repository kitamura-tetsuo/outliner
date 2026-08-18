import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../services/undo/undoRouter.svelte";
import Toolbar from "./Toolbar.svelte";

/** A registered undo scope, as a table or the outline would provide. */
function scope(name: string) {
    const doc = new Y.Doc();
    const map = doc.getMap<number>(name);
    const undo = new Y.UndoManager(map);
    globalUndoRouter.register(undo);
    return {
        undo,
        edit: (key: string, value: number) => doc.transact(() => map.set(key, value)),
        has: (key: string) => map.has(key),
        dispose: () => {
            globalUndoRouter.unregister(undo);
            undo.destroy();
        },
    };
}

describe("Toolbar undo/redo buttons", () => {
    beforeAll(() => {
        // The toolbar publishes its height through a ResizeObserver, which jsdom
        // does not implement. Nothing under test depends on the measurement.
        if (!("ResizeObserver" in globalThis)) {
            globalThis.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            } as unknown as typeof ResizeObserver;
        }
    });

    afterEach(() => {
        // `globalUndoRouter` is a module-scoped singleton: leftover history would
        // leak into the next test's `disabled` assertions.
        globalUndoRouter.clear();
    });

    test("renders both buttons, disabled while the history is empty", () => {
        const { getByTestId } = render(Toolbar, { props: {} });

        const undoBtn = getByTestId("toolbar-undo") as HTMLButtonElement;
        const redoBtn = getByTestId("toolbar-redo") as HTMLButtonElement;

        expect(undoBtn.getAttribute("aria-label")).toBe("Undo");
        expect(redoBtn.getAttribute("aria-label")).toBe("Redo");
        expect(undoBtn.getAttribute("title")).toBe("Undo (Ctrl+Z)");
        expect(redoBtn.getAttribute("title")).toBe("Redo (Ctrl+Shift+Z)");
        expect(undoBtn.hasAttribute("data-keep-editor-focus")).toBe(true);
        expect(redoBtn.hasAttribute("data-keep-editor-focus")).toBe(true);
        expect(undoBtn.disabled).toBe(true);
        expect(redoBtn.disabled).toBe(true);
    });

    test("enables Undo as soon as an operation is recorded and Redo once one is undone", async () => {
        const { getByTestId } = render(Toolbar, { props: {} });
        const undoBtn = getByTestId("toolbar-undo") as HTMLButtonElement;
        const redoBtn = getByTestId("toolbar-redo") as HTMLButtonElement;

        const table = scope("table");
        try {
            table.edit("a", 1);
            await waitFor(() => expect(undoBtn.disabled).toBe(false));
            expect(redoBtn.disabled).toBe(true);

            await fireEvent.click(undoBtn);
            expect(table.has("a")).toBe(false);
            await waitFor(() => expect(redoBtn.disabled).toBe(false));
            expect(undoBtn.disabled).toBe(true);

            await fireEvent.click(redoBtn);
            expect(table.has("a")).toBe(true);
            await waitFor(() => expect(undoBtn.disabled).toBe(false));
            expect(redoBtn.disabled).toBe(true);
        } finally {
            table.dispose();
        }
    });

    test("routes through the global router rather than the scope's own manager", async () => {
        const { getByTestId } = render(Toolbar, { props: {} });
        const undoBtn = getByTestId("toolbar-undo") as HTMLButtonElement;

        const table = scope("table");
        const directUndo = vi.spyOn(table.undo, "undo");
        try {
            table.edit("a", 1);
            await waitFor(() => expect(undoBtn.disabled).toBe(false));

            await fireEvent.click(undoBtn);

            // The router is what drove the scope, and it stayed in sync: the
            // operation moved to the redo side rather than being lost.
            expect(directUndo).toHaveBeenCalledTimes(1);
            expect(globalUndoRouter.undoDepth).toBe(0);
            expect(globalUndoRouter.redoDepth).toBe(1);
        } finally {
            directUndo.mockRestore();
            table.dispose();
        }
    });

    test("cancels pointerdown so the caret and software keyboard survive the click", async () => {
        const { getByTestId } = render(Toolbar, { props: {} });

        for (const id of ["toolbar-undo", "toolbar-redo"]) {
            const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
            await fireEvent(getByTestId(id), event);
            expect(event.defaultPrevented).toBe(true);
        }
    });
});
