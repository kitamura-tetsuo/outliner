// Read-only host flag through a Layout-nested Grid (issue #5458 REQ-005):
// OutlinerItemComponentRenderer -> LayoutBlock -> nested Grid must forward
// the host surface restriction to the numeric Width controls, exactly like a
// top-level Grid. Renders the real component chain over a real seeded
// Table/Grid and reads actual saved state — never a mocked setter.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../../schema/app-schema";
import { LAYOUT_COMPONENT_TYPE } from "../../services/layout/layoutModel";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { createGrid, getGridColumnWidth, getGridHandles } from "../../services/yjstable/gridDocs";
import { bindItemToGrid } from "../../services/yjstable/itemBinding";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import OutlinerItemComponentRenderer from "../OutlinerItemComponentRenderer.svelte";

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

/** A Layout hosting one Grid placement bound to a real seeded Table/Grid. */
function seedLayoutGrid() {
    const project = Project.createInstance("Layout readonly width tests");
    const page = project.addPage("Page", "tester");
    const layout = page.items.addNode("tester");
    layout.componentType = LAYOUT_COMPONENT_TYPE;
    const placement = layout.items.addNode("tester");
    placement.componentType = "yjstable";

    const tasksId = createTable(project.ydoc, "Tasks", "tasks");
    const handles = getTableHandles(project.ydoc, tasksId)!;
    setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
    addRecord(handles, { title: "Draft", status: "open" }, "t1");
    addRecord(handles, { title: "Ship", status: "done" }, "t2");
    const gridId = createGrid(project.ydoc, tasksId, { name: "G", query: QUERY });
    const grid = getGridHandles(project.ydoc, gridId)!;
    bindItemToGrid(placement, gridId, tasksId);
    return { project, layout, grid };
}

/** Open the nested Grid's UI Definition editor and return its title width input. */
async function openNestedWidthInput(rendered: { getByTestId: (id: string) => HTMLElement; }) {
    // Nested blocks arrive through async component imports; the width rows
    // additionally wait for the table engine (PGlite) plus the offline-tolerant
    // initial-sync timeout, so both waits are generous.
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

describe("Layout-nested Grid width controls follow the host read-only flag", { timeout: 60000 }, () => {
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

    it("disables the nested width control on a read-only host and commits nothing", async () => {
        const { project, layout, grid } = seedLayoutGrid();
        const rendered = render(OutlinerItemComponentRenderer, {
            props: { componentType: LAYOUT_COMPONENT_TYPE, item: layout, isReadOnly: true },
        });
        try {
            const input = await openNestedWidthInput(rendered);
            expect(input.disabled).toBe(true);

            let updates = 0;
            project.ydoc.on("update", () => updates++);
            const stackBefore = grid.undo.undoStack.length;

            // A commit attempt through the disabled control must not write.
            await fireEvent.input(input, { target: { value: "200" } });
            await fireEvent.keyDown(input, { key: "Enter" });
            await fireEvent.focusOut(input);

            expect(getGridColumnWidth(grid, "title")).toBeUndefined();
            expect(grid.undo.undoStack.length).toBe(stackBefore);
            expect(updates).toBe(0);
        } finally {
            rendered.unmount();
        }
    });

    it("still commits the nested width on an editable host", async () => {
        const { layout, grid } = seedLayoutGrid();
        const rendered = render(OutlinerItemComponentRenderer, {
            props: { componentType: LAYOUT_COMPONENT_TYPE, item: layout, isReadOnly: false },
        });
        try {
            const input = await openNestedWidthInput(rendered);
            expect(input.disabled).toBe(false);

            await fireEvent.input(input, { target: { value: "200" } });
            await fireEvent.keyDown(input, { key: "Enter" });

            expect(getGridColumnWidth(grid, "title")).toBe(200);
        } finally {
            rendered.unmount();
        }
    });
});
