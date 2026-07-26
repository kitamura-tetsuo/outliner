import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import YjsTableView from "./YjsTableView.svelte";

// Mock TableUndoManager handles
const mockDoc = new Y.Doc();
const mockHandles = {
    doc: mockDoc,
    tableId: "test-table",
    schemaText: mockDoc.getText("schemaText"),
    uiDef: mockDoc.getMap("uiDef"),
    data: mockDoc.getMap("data"),
    undo: { undo: vi.fn(), redo: vi.fn() },
};

vi.mock("../../lib/KeyEventHandler", () => ({
    isForeignInput: (target: EventTarget | null) => {
        if (!target) return false;
        const tag = (target as HTMLElement).tagName?.toUpperCase();
        return ["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON"].includes(tag);
    },
}));

describe("YjsTableView focus handling", () => {
    beforeEach(() => {
        editorOverlayStore.reset();
        vi.clearAllMocks();
    });

    it("clears cursor and selection when a foreign input inside the table gets focusin", async () => {
        // Render the Table View
        const projectDoc = new Y.Doc();
        const { getByTestId } = render(YjsTableView, {
            props: {
                handles: mockHandles as unknown as import("../../services/yjstable/tableDocs").TableHandles,
                projectDoc,
                tableName: "Test Table",
            },
        });

        // Add a local cursor and selection
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

    it("does not clear cursor and selection when a non-input element inside the table gets focusin", async () => {
        const projectDoc = new Y.Doc();
        const { getByTestId } = render(YjsTableView, {
            props: {
                handles: mockHandles as unknown as import("../../services/yjstable/tableDocs").TableHandles,
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
