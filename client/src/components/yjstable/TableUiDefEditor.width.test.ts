// Numeric width controls of the Grid UI Definition editor (issue #5458):
// local drafts, validation, Enter/blur commit through the shared isolated
// width writer, external-update cancellation, and host read-only gating.
// Every assertion starts from real Grid creation plus production writers and
// reads actual saved state — never a mocked setter.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { getGridColumnWidth, readGridComponents } from "../../services/yjstable/gridDocs";
import {
    createGrid,
    getGridHandles,
    getGridSourceTableId,
    type GridHandles,
    setGridColumnWidth,
} from "../../services/yjstable/gridDocs";
import { createTable } from "../../services/yjstable/tableDocs";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

const QUERY = "SELECT id, title, done FROM tasks";
const COLUMNS = ["id", "title", "done"];

function makeGrid(seed: Record<string, { widthPx?: number; hidden?: boolean; label?: string; }> = {}): {
    doc: Y.Doc;
    grid: GridHandles;
} {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "T", "t");
    const gridId = createGrid(doc, tableId, { name: "G", query: QUERY, components: seed });
    return { doc, grid: getGridHandles(doc, gridId)! };
}

function editorProps(grid: GridHandles, overrides: Record<string, unknown> = {}) {
    const mirror = readGridComponents(grid);
    return {
        grid,
        schema: undefined,
        query: QUERY,
        componentTypes: mirror.types as Record<string, string | undefined>,
        columnLabels: mirror.labels as Record<string, string | undefined>,
        hiddenColumns: mirror.hidden,
        resultColumns: COLUMNS,
        columnOrder: [] as string[],
        columnWidths: mirror.widths,
        ...overrides,
    };
}

/** jsdom does not track native badInput; shadow the element's validity. */
function setBadInput(input: HTMLInputElement, bad: boolean): void {
    const validity = input.validity;
    Object.defineProperty(input, "validity", {
        value: new Proxy(validity, { get: (target, prop) => (prop === "badInput" ? bad : Reflect.get(target, prop)) }),
        configurable: true,
    });
}

describe("TableUiDefEditor width controls", () => {
    beforeEach(() => {
        fakeMonacoRegistry.reset();
        globalUndoRouter.clear();
    });

    it("offers a labeled width control per result row, showing saved widths and auto blanks", () => {
        const { grid } = makeGrid({ title: { widthPx: 180 }, done: { hidden: true } });
        const { container, getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });

        for (const column of COLUMNS) {
            const input = getByTestId(`yjs-table-width-${column}`) as HTMLInputElement;
            expect(input.getAttribute("aria-label")).toBe(`Width (px) for ${column}`);
            expect(input.type).toBe("number");
        }
        expect((getByTestId("yjs-table-width-title") as HTMLInputElement).value).toBe("180");
        expect((getByTestId("yjs-table-width-id") as HTMLInputElement).value).toBe("");
        // Hidden and computed result rows get the same control, keyed by exact name.
        expect((getByTestId("yjs-table-width-done") as HTMLInputElement).value).toBe("");
        expect(container.querySelectorAll(".width-auto").length).toBeGreaterThanOrEqual(2);
    });

    it("reads a malformed stored width as auto without repairing the document", () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        (grid.components.get("title") as Y.Map<unknown>).set("widthPx", "180");
        let updates = 0;
        doc.on("update", () => updates++);

        const { getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });
        expect((getByTestId("yjs-table-width-title") as HTMLInputElement).value).toBe("");
        expect(getGridColumnWidth(grid, "title")).toBeUndefined();
        expect(updates).toBe(0);
        expect((grid.components.get("title") as Y.Map<unknown>).get("widthPx")).toBe("180");
    });

    it("commits a valid width on Enter through the shared writer with one history step", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        let updates = 0;
        doc.on("update", () => updates++);
        const stackBefore = grid.undo.undoStack.length;
        const { getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });

        const input = getByTestId("yjs-table-width-id") as HTMLInputElement;
        await fireEvent.input(input, { target: { value: "220" } });
        // Typing alone never writes.
        expect(getGridColumnWidth(grid, "id")).toBeUndefined();
        expect(updates).toBe(0);

        await fireEvent.keyDown(input, { key: "Enter" });
        expect(getGridColumnWidth(grid, "id")).toBe(220);
        expect(updates).toBeGreaterThan(0);
        expect(grid.undo.undoStack.length).toBe(stackBefore + 1);

        grid.undo.undo();
        expect(getGridColumnWidth(grid, "id")).toBeUndefined();
        grid.undo.redo();
        expect(getGridColumnWidth(grid, "id")).toBe(220);
    });

    it("commits on blur and treats Enter-then-blur as a single operation", async () => {
        const { grid } = makeGrid();
        const { getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });

        const input = getByTestId("yjs-table-width-title") as HTMLInputElement;
        await fireEvent.input(input, { target: { value: "180" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        const stackAfterEnter = grid.undo.undoStack.length;
        expect(getGridColumnWidth(grid, "title")).toBe(180);

        await fireEvent.focusOut(input);
        expect(getGridColumnWidth(grid, "title")).toBe(180);
        expect(grid.undo.undoStack.length).toBe(stackAfterEnter);

        // Blur-only commit path on a second column.
        const done = getByTestId("yjs-table-width-done") as HTMLInputElement;
        await fireEvent.input(done, { target: { value: "64" } });
        await fireEvent.focusOut(done);
        expect(getGridColumnWidth(grid, "done")).toBe(64);
    });

    it("rejects out-of-range, fractional and badInput drafts visibly without writing", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        let updates = 0;
        doc.on("update", () => updates++);
        const stackBefore = grid.undo.undoStack.length;
        const { container, getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = getByTestId("yjs-table-width-title") as HTMLInputElement;

        for (const bad of ["31", "4097", "1.5"]) {
            await fireEvent.input(input, { target: { value: bad } });
            await fireEvent.focusOut(input);
            expect(container.querySelector('[data-testid="yjs-table-width-error-title"]')).not.toBeNull();
            expect(getGridColumnWidth(grid, "title")).toBe(180);
        }
        // Correction after a validation error stays possible.
        await fireEvent.input(input, { target: { value: "32" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(getGridColumnWidth(grid, "title")).toBe(32);
        expect(container.querySelector('[data-testid="yjs-table-width-error-title"]')).toBeNull();

        await fireEvent.input(input, { target: { value: "4096" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(getGridColumnWidth(grid, "title")).toBe(4096);

        expect(updates).toBeGreaterThan(0);
        expect(grid.undo.undoStack.length).toBeGreaterThan(stackBefore);
    });

    it("accepts complete integral decimal and exponent spellings of a saved width", async () => {
        const { grid } = makeGrid({ title: { widthPx: 180 } });
        const { container, getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });

        const id = getByTestId("yjs-table-width-id") as HTMLInputElement;
        await fireEvent.input(id, { target: { value: "180.0" } });
        await fireEvent.keyDown(id, { key: "Enter" });
        expect(getGridColumnWidth(grid, "id")).toBe(180);
        expect(container.querySelector('[data-testid="yjs-table-width-error-id"]')).toBeNull();

        const done = getByTestId("yjs-table-width-done") as HTMLInputElement;
        await fireEvent.input(done, { target: { value: "1.8e2" } });
        await fireEvent.keyDown(done, { key: "Enter" });
        expect(getGridColumnWidth(grid, "done")).toBe(180);
        expect(container.querySelector('[data-testid="yjs-table-width-error-done"]')).toBeNull();

        // A fractional-looking spelling with an integral numeric value commits.
        await fireEvent.input(done, { target: { value: "1.5e2" } });
        await fireEvent.keyDown(done, { key: "Enter" });
        expect(getGridColumnWidth(grid, "done")).toBe(150);
        expect(container.querySelector('[data-testid="yjs-table-width-error-done"]')).toBeNull();

        // A genuinely fractional value still rejects without writing.
        const title = getByTestId("yjs-table-width-title") as HTMLInputElement;
        await fireEvent.input(title, { target: { value: "180.5" } });
        await fireEvent.focusOut(title);
        expect(container.querySelector('[data-testid="yjs-table-width-error-title"]')).not.toBeNull();
        expect(getGridColumnWidth(grid, "title")).toBe(180);

        // An incomplete exponent (typed "1e") leaves a real number control
        // with an empty value in badInput state. jsdom sanitizes "1e" to a
        // plain empty value instead, so the native state is shimmed exactly
        // like the dedicated badInput test below.
        await fireEvent.input(title, { target: { value: "" } });
        setBadInput(title, true);
        await fireEvent.focusOut(title);
        expect(container.querySelector('[data-testid="yjs-table-width-error-title"]')).not.toBeNull();
        expect(getGridColumnWidth(grid, "title")).toBe(180);
    });

    it("discards a pending draft when the Grid entry is replaced under the same ID", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        const gridId = grid.gridId;
        const rendered = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;

        await fireEvent.input(input, { target: { value: "240" } });
        expect(input.value).toBe("240");

        // A synchronized transaction replaces the Grid entry under the same
        // Grid ID, retaining the source Table, result names and even the same
        // saved width. The mounted editor observes the replacement handles on
        // rerender. Without entry-identity tracking the retained 240 draft
        // would commit into the replacement object it never began editing.
        const sourceTableId = getGridSourceTableId(doc, gridId)!;
        createGrid(doc, sourceTableId, {
            gridId,
            name: "G",
            query: QUERY,
            components: { title: { widthPx: 180 } },
        });
        const replacement = getGridHandles(doc, gridId)!;
        expect(replacement.entry).not.toBe(grid.entry);
        await rendered.rerender({ ...editorProps(replacement) });

        // The stale draft is discarded: the control shows the replacement's
        // saved 180, with no error and no cancellation notice.
        await waitFor(() => expect(input.value).toBe("180"));
        expect(rendered.container.querySelector('[data-testid="yjs-table-width-error-title"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="yjs-table-width-notice-title"]')).toBeNull();

        let updates = 0;
        doc.on("update", () => updates++);
        const stackBefore = replacement.undo.undoStack.length;
        await fireEvent.keyDown(input, { key: "Enter" });
        await fireEvent.focusOut(input);

        // The stale draft wrote nowhere: the replacement keeps its own 180
        // (not the pending 240) and the document emitted no update.
        expect(getGridColumnWidth(replacement, "title")).toBe(180);
        expect(updates).toBe(0);
        expect(replacement.undo.undoStack.length).toBe(stackBefore);
    });

    it("shows validation failure for native badInput instead of resetting to auto", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        let updates = 0;
        doc.on("update", () => updates++);
        const { container, getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = getByTestId("yjs-table-width-title") as HTMLInputElement;

        await fireEvent.input(input, { target: { value: "" } });
        setBadInput(input, true);
        await fireEvent.focusOut(input);

        expect(container.querySelector('[data-testid="yjs-table-width-error-title"]')).not.toBeNull();
        expect(getGridColumnWidth(grid, "title")).toBe(180);
        expect(updates).toBe(0);
    });

    it("resets to auto only on commit of a genuinely empty input, and Escape discards drafts", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        let updates = 0;
        doc.on("update", () => updates++);
        const rendered = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;

        // Empty while typing is not a reset.
        await fireEvent.input(input, { target: { value: "" } });
        expect(getGridColumnWidth(grid, "title")).toBe(180);
        expect(updates).toBe(0);

        // Escape restores the saved display without an update.
        await fireEvent.keyDown(input, { key: "Escape" });
        expect(input.value).toBe("180");
        expect(getGridColumnWidth(grid, "title")).toBe(180);
        expect(updates).toBe(0);

        // A genuinely empty draft commits auto on blur. The parent mirror
        // re-delivers the new saved state, as YjsTableView's observer does.
        await fireEvent.input(input, { target: { value: "" } });
        await fireEvent.focusOut(input);
        expect(getGridColumnWidth(grid, "title")).toBeUndefined();
        await rendered.rerender({ ...editorProps(grid) });
        await waitFor(() => expect(input.value).toBe(""));
        expect(updates).toBeGreaterThan(0);
    });

    it("treats same-value and already-auto commits as no-ops with no update or history", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        let updates = 0;
        doc.on("update", () => updates++);
        const stackBefore = grid.undo.undoStack.length;
        const { getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });

        const title = getByTestId("yjs-table-width-title") as HTMLInputElement;
        await fireEvent.input(title, { target: { value: "180" } });
        await fireEvent.keyDown(title, { key: "Enter" });
        expect(getGridColumnWidth(grid, "title")).toBe(180);
        expect(updates).toBe(0);
        expect(grid.undo.undoStack.length).toBe(stackBefore);

        const id = getByTestId("yjs-table-width-id") as HTMLInputElement;
        await fireEvent.input(id, { target: { value: "" } });
        await fireEvent.focusOut(id);
        expect(getGridColumnWidth(grid, "id")).toBeUndefined();
        expect(updates).toBe(0);
        expect(grid.undo.undoStack.length).toBe(stackBefore);
    });

    it("keeps two rapid commits as separate Undo steps", async () => {
        const { grid } = makeGrid({ title: { widthPx: 180 } });
        globalUndoRouter.clear();
        const { getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = getByTestId("yjs-table-width-title") as HTMLInputElement;

        await fireEvent.input(input, { target: { value: "220" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        await fireEvent.input(input, { target: { value: "260" } });
        await fireEvent.keyDown(input, { key: "Enter" });
        expect(getGridColumnWidth(grid, "title")).toBe(260);

        globalUndoRouter.undo();
        expect(getGridColumnWidth(grid, "title")).toBe(220);
        globalUndoRouter.undo();
        expect(getGridColumnWidth(grid, "title")).toBe(180);
        globalUndoRouter.redo();
        expect(getGridColumnWidth(grid, "title")).toBe(220);
    });

    it("discards a pending draft on an observed same-column change without writing back", async () => {
        const { grid } = makeGrid({ title: { widthPx: 180 } });
        const rendered = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;

        await fireEvent.input(input, { target: { value: "240" } });
        expect(input.value).toBe("240");

        // A second client commits the same column; the parent mirror delivers it.
        setGridColumnWidth(grid, "title", 210);
        await rendered.rerender({ ...editorProps(grid) });

        expect(input.value).toBe("210");
        expect(rendered.container.querySelector('[data-testid="yjs-table-width-notice-title"]')).not.toBeNull();

        let updates = 0;
        grid.projectDoc.on("update", () => updates++);
        await fireEvent.focusOut(input);
        expect(getGridColumnWidth(grid, "title")).toBe(210);
        expect(updates).toBe(0);
    });

    it("keeps a pending draft across disjoint updates and commits without clobbering them", async () => {
        const { grid } = makeGrid({ title: { widthPx: 180 } });
        const rendered = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;

        await fireEvent.input(input, { target: { value: "240" } });
        setGridColumnWidth(grid, "done", 64);
        await rendered.rerender({ ...editorProps(grid) });

        // The draft survives a disjoint width change.
        expect(input.value).toBe("240");
        expect(rendered.container.querySelector('[data-testid="yjs-table-width-notice-title"]')).toBeNull();

        await fireEvent.keyDown(input, { key: "Enter" });
        expect(getGridColumnWidth(grid, "title")).toBe(240);
        expect(getGridColumnWidth(grid, "done")).toBe(64);
    });

    it("disables width controls on a read-only host and discards drafts on transition", async () => {
        const { grid } = makeGrid({ title: { widthPx: 180 } });
        const rendered = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;
        expect(input.disabled).toBe(false);

        await fireEvent.input(input, { target: { value: "240" } });
        await rendered.rerender({ ...editorProps(grid), isReadOnly: true });

        const locked = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;
        expect(locked.disabled).toBe(true);
        expect(locked.value).toBe("180");
        expect(getGridColumnWidth(grid, "title")).toBe(180);
    });

    it("discards the draft when the Grid entry is deleted before commit", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        const gridId = grid.gridId;
        const rendered = render(TableUiDefEditor, { props: editorProps(grid) });
        const input = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;

        await fireEvent.input(input, { target: { value: "240" } });
        doc.getMap("yjsGrids").delete(gridId);
        await fireEvent.focusOut(input);

        expect(doc.getMap("yjsGrids").get(gridId)).toBeUndefined();
    });

    it("addresses exact result names despite duplicate labels and reorder", async () => {
        const { grid } = makeGrid();
        const rendered = render(TableUiDefEditor, {
            props: {
                ...editorProps(grid),
                resultColumns: ["title", "subject"],
                columnOrder: ["subject", "title"],
                columnLabels: { title: "Same", subject: "Same" },
            },
        });
        const titleInput = rendered.getByTestId("yjs-table-width-title") as HTMLInputElement;
        const subjectInput = rendered.getByTestId("yjs-table-width-subject") as HTMLInputElement;

        await fireEvent.input(subjectInput, { target: { value: "200" } });
        await fireEvent.keyDown(subjectInput, { key: "Enter" });
        expect(getGridColumnWidth(grid, "subject")).toBe(200);
        expect(getGridColumnWidth(grid, "title")).toBeUndefined();
        expect(titleInput.value).toBe("");
    });

    it("width edits leave query, labels and source records untouched", async () => {
        const { grid } = makeGrid({ title: { widthPx: 180 } });
        const queryBefore = grid.entry.get("query");
        const { getByTestId } = render(TableUiDefEditor, { props: editorProps(grid) });

        const input = getByTestId("yjs-table-width-title") as HTMLInputElement;
        await fireEvent.input(input, { target: { value: "220" } });
        await fireEvent.keyDown(input, { key: "Enter" });

        expect(grid.entry.get("query")).toBe(queryBefore);
        expect(getGridColumnWidth(grid, "title")).toBe(220);
        expect(readGridComponents(grid).labels["title"]).toBeUndefined();
    });
    it("shows a header-resize preview as an explicitly unsaved, read-only value that never writes", async () => {
        const { doc, grid } = makeGrid({ title: { widthPx: 180 } });
        let updates = 0;
        doc.on("update", () => updates++);
        const { getByTestId, queryByTestId, rerender } = render(TableUiDefEditor, {
            props: editorProps(grid, { widthPreview: { column: "title", width: 217 } }),
        });
        const input = getByTestId("yjs-table-width-title") as HTMLInputElement;
        expect(input.value).toBe("217");
        expect(input.readOnly).toBe(true);
        expect(input.dataset.widthPreview).toBe("unsaved");
        expect(getByTestId("yjs-table-width-preview-title").textContent).toContain("Unsaved preview");
        // Other columns keep their committed display.
        expect(queryByTestId("yjs-table-width-preview-id")).toBeNull();

        // Enter/blur on the previewing control commit nothing.
        await fireEvent.keyDown(input, { key: "Enter" });
        await fireEvent.focusOut(input);
        expect(updates).toBe(0);
        expect(getGridColumnWidth(grid, "title")).toBe(180);

        // Once the preview ends the control reflects committed shared state.
        await rerender(editorProps(grid, { widthPreview: undefined }));
        expect(input.value).toBe("180");
        expect(input.readOnly).toBe(false);
        expect(queryByTestId("yjs-table-width-preview-title")).toBeNull();
    });
});
