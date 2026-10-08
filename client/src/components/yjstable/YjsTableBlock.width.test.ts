// A synchronized Grid-registry replacement under the same Grid ID must not
// receive a width draft started against the replaced entry (issue #5458
// REQ-005). Renders the real YjsTableBlock over a real seeded Table/Grid,
// drafts a width in its UI editor, replaces the registry entry atomically,
// and proves Enter/blur afterwards writes nothing and records no history.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../../schema/app-schema";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { createGrid, getGridColumnWidth, getGridHandles } from "../../services/yjstable/gridDocs";
import { bindItemToGrid } from "../../services/yjstable/itemBinding";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { setPage } from "../../tests/mocks/appState.svelte";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import YjsTableBlock from "./YjsTableBlock.svelte";

vi.mock("$app/state", () => import("../../tests/mocks/appState.svelte"));
setPage({ params: {} });

// The UI Definition panel embeds the shared Monaco SQL editor; see
// SqlEditor.test.ts for why the runtime is faked under jsdom.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

vi.mock("../../lib/KeyEventHandler", () => ({
    isForeignInput: (target: EventTarget | null) => {
        if (!target) return false;
        const el = target as HTMLElement;
        // Mirrors the real predicate: an embedded editor surface owns its
        // subtree, everything else is matched by tag name.
        if (el.closest?.("[data-foreign-editor]")) return true;
        const tag = el.tagName?.toUpperCase();
        return ["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON"].includes(tag);
    },
}));

const QUERY = "SELECT id, title, status FROM tasks ORDER BY id";

/** A Grid host item bound to a real seeded Table/Grid with title width 180. */
function seedGridHost() {
    const project = Project.createInstance("Replaced grid width tests");
    const page = project.addPage("Page", "tester");
    const host = page.items.addNode("tester");
    host.componentType = "yjstable";

    const tasksId = createTable(project.ydoc, "Tasks", "tasks");
    const handles = getTableHandles(project.ydoc, tasksId)!;
    setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
    addRecord(handles, { title: "Draft", status: "open" }, "t1");
    addRecord(handles, { title: "Ship", status: "done" }, "t2");
    const gridId = createGrid(project.ydoc, tasksId, {
        name: "G",
        query: QUERY,
        components: { title: { widthPx: 180 } },
    });
    const grid = getGridHandles(project.ydoc, gridId)!;
    bindItemToGrid(host, gridId, tasksId);
    return { project, host, grid, gridId, tasksId };
}

/** Open the block's UI Definition editor and return its title width input. */
async function openWidthInput(rendered: { getByTestId: (id: string) => HTMLElement; }) {
    // The Grid view arrives through the table engine (PGlite) plus the
    // offline-tolerant initial-sync timeout, so both waits are generous.
    let toggle!: HTMLElement;
    await waitFor(() => {
        toggle = rendered.getByTestId("yjs-table-toggle-ui");
        expect(toggle).toBeTruthy();
    }, { timeout: 30000 });
    await fireEvent.click(toggle);
    let input!: HTMLInputElement;
    await waitFor(() => {
        input = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;
        expect(input).toBeTruthy();
    }, { timeout: 45000 });
    return input;
}

describe("YjsTableBlock width drafts across Grid entry replacement", { timeout: 120000 }, () => {
    beforeEach(() => {
        fakeMonacoRegistry.reset();
        globalUndoRouter.clear();
        editorOverlayStore.reset();
    });

    afterEach(async () => {
        await resetTableEngineForTests();
    });

    afterAll(async () => {
        await resetPgliteForTests();
    });

    it("discards a pending draft when the registry entry is replaced under the same ID", async () => {
        const { project, host, grid, gridId, tasksId } = seedGridHost();
        const rendered = render(YjsTableBlock, { props: { item: host } });
        try {
            const input = await openWidthInput(rendered);
            await waitFor(() => expect(input.value).toBe("180"));

            await fireEvent.input(input, { target: { value: "240" } });
            expect(input.value).toBe("240");

            // A synchronized transaction replaces the Grid entry under the
            // same Grid ID, retaining the source Table and result names.
            project.ydoc.transact(() => {
                createGrid(project.ydoc, tasksId, { gridId, name: "G", query: QUERY });
            });
            const replacement = getGridHandles(project.ydoc, gridId)!;
            expect(replacement.entry).not.toBe(grid.entry);

            // The block observes the replacement and remounts its view: the
            // UI editor closes, so the pending control is gone entirely.
            await waitFor(() => {
                expect(rendered.queryByTestId("yjs-table-width-title")).toBeNull();
            }, { timeout: 15000 });

            // Reopening shows the replacement's saved state (auto), never the
            // discarded 240 draft.
            const reopened = await openWidthInput(rendered);
            expect(reopened.value).toBe("");

            let updates = 0;
            project.ydoc.on("update", () => updates++);
            const stackBefore = replacement.undo.undoStack.length;
            await fireEvent.keyDown(reopened, { key: "Enter" });
            await fireEvent.focusOut(reopened);

            expect(getGridColumnWidth(replacement, "title")).toBeUndefined();
            expect(updates).toBe(0);
            expect(replacement.undo.undoStack.length).toBe(stackBefore);
        } finally {
            rendered.unmount();
        }
    });
});
