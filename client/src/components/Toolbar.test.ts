import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import * as Y from "yjs";
import type { Project } from "../schema/app-schema";
import { globalUndoRouter } from "../services/undo/undoRouter.svelte";
import { isProvisionalProject, store } from "../stores/store.svelte";
import Toolbar from "./Toolbar.svelte";

/**
 * A project as the toolbar sees it: the title is read from — and observed on —
 * the Yjs metadata map, so a real `Y.Doc` is what the mirror needs.
 */
function projectDoc(title: string) {
    const ydoc = new Y.Doc();
    ydoc.getMap("metadata").set("title", title);
    return {
        project: { ydoc } as unknown as Project,
        rename: (next: string) => ydoc.getMap("metadata").set("title", next),
    };
}

// Captured at import time, before any test clears the store: this is the
// placeholder `store.svelte.ts` seeds from the URL at startup.
const provisionalProject = store.project;

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

describe("Toolbar project name", () => {
    beforeAll(() => {
        if (!("ResizeObserver" in globalThis)) {
            globalThis.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            } as unknown as typeof ResizeObserver;
        }
    });

    afterEach(() => {
        cleanup();
        // `store` is a module-scoped singleton: a leftover project would leak
        // into the next test's "not loaded yet" assertion.
        store.project = undefined;
    });

    test("renders no label while no project is loaded", () => {
        store.project = undefined;
        const { queryByTestId } = render(Toolbar, { props: {} });
        expect(queryByTestId("toolbar-project-name")).toBeNull();
    });

    test("stays silent for the provisional project the store seeds from the URL", () => {
        // The startup placeholder is titled from the path, so showing it would
        // put a route segment — "Untitled Project" at the root — in the header.
        store.project = provisionalProject;
        expect(isProvisionalProject(store.project)).toBe(true);

        const { queryByTestId } = render(Toolbar, { props: {} });
        expect(queryByTestId("toolbar-project-name")).toBeNull();
    });

    test("names the loaded project and links to its page list", async () => {
        const { project } = projectDoc("Alpha");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("Alpha");
        expect(label.getAttribute("href")).toBe("/Alpha");
        expect(label.getAttribute("aria-label")).toBe("Project: Alpha");
    });

    test("falls back to the global store when no project prop is given", async () => {
        const { project } = projectDoc("From Store");
        store.project = project;

        const { findByTestId } = render(Toolbar, { props: {} });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("From Store");
    });

    test("percent-encodes a title that is not URL-safe", async () => {
        const { project } = projectDoc("My Project/2");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.getAttribute("href")).toBe("/My%20Project%2F2");
    });

    test("follows a rename of the open project rather than going stale", async () => {
        const { project, rename } = projectDoc("Before");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("Before");

        rename("After");
        await waitFor(() => expect(label.textContent?.trim()).toBe("After"));
    });

    test("switching projects replaces the name instead of leaving a stale one", async () => {
        const first = projectDoc("First");
        store.project = first.project;
        const { findByTestId } = render(Toolbar, { props: {} });
        expect((await findByTestId("toolbar-project-name")).textContent?.trim()).toBe("First");

        const second = projectDoc("Second");
        store.project = second.project;

        await waitFor(async () => {
            expect((await findByTestId("toolbar-project-name")).textContent?.trim()).toBe("Second");
        });
    });
});
