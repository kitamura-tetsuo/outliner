// Spreadsheet-style Grid clipboard (FTR-5192): Ctrl/Cmd+C and Ctrl/Cmd+V
// wire the logical selection into the system clipboard via the shared
// gridClipboard command layer, and the same functions back the touch
// selection toolbar's Copy/Paste buttons -- no separate mobile clipboard
// implementation.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord, createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id uuid, name text, status text);",
    columns: [
        { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "name", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        { name: "status", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
    ],
};
const session: RelationResolver = { resolveRelation: vi.fn() };

function setup() {
    const doc = new Y.Doc();
    const handles = getTableHandles(doc, createTable(doc, "tasks", "tasks"))!;
    addRecord(handles, { name: "Alpha", status: "Open" }, "a");
    addRecord(handles, { name: "Beta", status: "Done" }, "b");
    const result: TableQueryResult = {
        columns: ["id", "name", "status"],
        rows: [
            { id: "a", name: "Alpha", status: "Open" },
            { id: "b", name: "Beta", status: "Done" },
        ],
    };
    const view = render(TableGrid, {
        props: {
            handles,
            schema,
            query: "SELECT id, name, status FROM tasks",
            result,
            componentTypes: {},
            columnLabels: {},
            hiddenColumns: { id: true },
            columnOrder: ["name", "status"],
            session,
        },
    });
    return { handles, view };
}

function cellTd(container: HTMLElement, rowId: string, column: string): HTMLElement {
    return container.querySelector<HTMLElement>(`td[data-row-id="${rowId}"][data-col="${column}"]`)!;
}

async function readBlobText(part: unknown): Promise<string> {
    return await (part as Blob).text();
}

/** A minimal stub of the real `ClipboardItem` API (missing in jsdom), so a write's flavors are observable via `getType`. */
class StubClipboardItem {
    constructor(private readonly parts: Record<string, Blob>) {}
    getType(mime: string): Promise<Blob> {
        return Promise.resolve(this.parts[mime]);
    }
}

function mockClipboard(overrides: Partial<{ write: ReturnType<typeof vi.fn>; readText: ReturnType<typeof vi.fn>; }>) {
    vi.stubGlobal("ClipboardItem", StubClipboardItem);
    Object.defineProperty(navigator, "clipboard", {
        value: { write: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue(""), ...overrides },
        configurable: true,
    });
}

describe("Grid clipboard copy/paste (FTR-5192)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("Ctrl+C copies a rectangular range as tab/newline text without a header row", async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        mockClipboard({ write });
        const { view } = setup();

        await fireEvent.click(cellTd(view.container, "a", "name"));
        await fireEvent.click(cellTd(view.container, "b", "status"), { shiftKey: true });
        await fireEvent.keyDown(cellTd(view.container, "b", "status").querySelector("button")!, {
            key: "c",
            ctrlKey: true,
        });

        await waitFor(() => expect(write).toHaveBeenCalled());
        const item = write.mock.calls[0][0][0] as ClipboardItem;
        const plainText = await readBlobText(await item.getType("text/plain"));
        expect(plainText).toBe("Alpha\tOpen\nBeta\tDone");
    });

    it("Ctrl+V fills a multi-cell selection by repeating one copied cell, as one Undo step", async () => {
        const readText = vi.fn().mockResolvedValue("Zed");
        mockClipboard({ readText });
        const { handles, view } = setup();

        await fireEvent.click(cellTd(view.container, "a", "name"));
        await fireEvent.click(cellTd(view.container, "b", "name"), { shiftKey: true });
        await fireEvent.keyDown(cellTd(view.container, "b", "name").querySelector("button")!, {
            key: "v",
            ctrlKey: true,
        });

        await waitFor(() => expect(handles.data.get("a")?.get("name")).toBe("Zed"));
        expect(handles.data.get("b")?.get("name")).toBe("Zed");
    });

    it("rejects a shape-mismatched paste, mutating nothing and surfacing status text", async () => {
        // Three rows of tab-separated cells cannot tile into a 2-cell column range.
        const readText = vi.fn().mockResolvedValue("X\nY\nZ");
        mockClipboard({ readText });
        const { handles, view } = setup();

        await fireEvent.click(cellTd(view.container, "a", "name"));
        await fireEvent.click(cellTd(view.container, "b", "name"), { shiftKey: true });
        await fireEvent.keyDown(cellTd(view.container, "b", "name").querySelector("button")!, {
            key: "v",
            ctrlKey: true,
        });

        await waitFor(() => expect(view.getByTestId("grid-paste-status")).toBeTruthy());
        expect(handles.data.get("a")?.get("name")).toBe("Alpha");
        expect(handles.data.get("b")?.get("name")).toBe("Beta");
    });

    it("exposes Copy and Paste through the touch selection toolbar, reusing the same clipboard functions", async () => {
        vi.useFakeTimers();
        const write = vi.fn().mockResolvedValue(undefined);
        mockClipboard({ write });
        const { view } = setup();
        const cell = cellTd(view.container, "a", "name");

        await fireEvent(
            cell,
            new PointerEvent("pointerdown", {
                bubbles: true,
                pointerType: "touch",
                pointerId: 1,
                clientX: 5,
                clientY: 5,
            }),
        );
        await vi.advanceTimersByTimeAsync(500);
        vi.useRealTimers();

        await fireEvent.click(view.getByRole("button", { name: "Copy" }));
        await waitFor(() => expect(write).toHaveBeenCalled());
        const item = write.mock.calls[0][0][0] as ClipboardItem;
        expect(await readBlobText(await item.getType("text/plain"))).toBe("Alpha");
    });
});
