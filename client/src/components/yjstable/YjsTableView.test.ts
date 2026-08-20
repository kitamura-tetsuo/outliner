import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "../../services/yjstable/gridDocs";
import { createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import YjsTableView from "./YjsTableView.svelte";

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

// The UI Definition panel embeds the shared Monaco SQL editor; see
// SqlEditor.test.ts for why the runtime is faked under jsdom.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

function makeProps() {
    const projectDoc = new Y.Doc();
    const tableId = createTable(projectDoc, "T", "t");
    const handles = getTableHandles(projectDoc, tableId)!;
    const gridId = createGrid(projectDoc, tableId, { name: "G", query: "SELECT 1" });
    const grid = getGridHandles(projectDoc, gridId)!;
    return { projectDoc, handles, grid };
}

describe("YjsTableView focus handling", () => {
    beforeEach(() => {
        editorOverlayStore.reset();
        vi.clearAllMocks();
    });

    it("clears cursor and selection when a foreign input inside the table gets focusin", async () => {
        const { projectDoc, handles, grid } = makeProps();
        const { getByTestId } = render(YjsTableView, {
            props: {
                grid,
                handles,
                projectDoc,
                tableName: "Test Table",
            },
        });

        editorOverlayStore.addCursor({ itemId: "item-1", offset: 0, isActive: true, userId: "local" });
        editorOverlayStore.setSelection({
            startItemId: "item-1",
            startOffset: 0,
            endItemId: "item-1",
            endOffset: 5,
            userId: "local",
        });

        expect(Object.keys(editorOverlayStore.cursors).length).toBe(1);
        expect(Object.keys(editorOverlayStore.selections).length).toBe(1);

        // Toggle UI view to expose the query input
        const uiToggleButton = getByTestId("yjs-table-toggle-ui");
        await fireEvent.click(uiToggleButton);

        // Find the query input that should trigger the focusin
        const queryInput = getByTestId("yjs-table-query-input");

        // Fire focusin on the query input
        await fireEvent.focusIn(queryInput);

        // Verify that the cursors and selections were cleared
        expect(Object.keys(editorOverlayStore.cursors).length).toBe(0);
        expect(Object.keys(editorOverlayStore.selections).length).toBe(0);
    });

    it("does not render table-local undo/redo buttons", () => {
        const { projectDoc, handles, grid } = makeProps();
        const { queryByTestId } = render(YjsTableView, {
            props: {
                grid,
                handles,
                projectDoc,
                tableName: "Test Table",
            },
        });

        expect(queryByTestId("yjs-table-undo")).toBeNull();
        expect(queryByTestId("yjs-table-redo")).toBeNull();
    });

    it("does not clear cursor and selection when a non-input element inside the table gets focusin", async () => {
        const { projectDoc, handles, grid } = makeProps();
        const { getByTestId } = render(YjsTableView, {
            props: {
                grid,
                handles,
                projectDoc,
                tableName: "Test Table",
            },
        });

        editorOverlayStore.addCursor({ itemId: "item-1", offset: 0, isActive: true, userId: "local" });

        expect(Object.keys(editorOverlayStore.cursors).length).toBe(1);

        // Fire focusin on a non-input element, like the table name span
        const tableNameSpan = getByTestId("yjs-table-name");
        await fireEvent.focusIn(tableNameSpan);

        // Verify the cursor was not cleared
        expect(Object.keys(editorOverlayStore.cursors).length).toBe(1);
    });
});
