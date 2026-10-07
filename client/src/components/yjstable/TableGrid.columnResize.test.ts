// Header drag resizing (issue #5459) at the TableGrid render boundary.
//
// Widths originate from the production path only: `createGrid` seeds, the
// production width writer, and the real handle's pointer handlers. Saved
// state, Yjs updates and Grid history are observed independently of the
// component. jsdom has no layout, so the starting geometry of an auto column
// measures 0px; the measured CSS-pixel behavior lives in the
// `grd-grid-width-drag-*` E2E specs.

import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { resizeCandidate } from "../../services/yjstable/columnResize";
import {
    createGrid,
    getGridHandles,
    getGridRegistry,
    type GridHandles,
    readGridComponents,
    retainGridUndoManager,
    setGridColumnWidth,
    setGridComponentField,
} from "../../services/yjstable/gridDocs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import TableGrid from "./TableGrid.svelte";

const QUERY = "SELECT id, title, done FROM tasks";

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id uuid, title text, done boolean);",
    columns: [
        { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "title", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        { name: "done", dataType: "boolean", isNullable: true, isPrimaryKey: false, kind: "boolean", checkOptions: [] },
    ],
};

interface Fixture {
    doc: Y.Doc;
    grid: GridHandles;
    tableId: string;
    updates: () => number;
}

function fixture(components: Record<string, { widthPx?: number; }> = {}): Fixture {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "Tasks", "tasks");
    const gridId = createGrid(doc, tableId, { name: "G", query: QUERY, components });
    const grid = getGridHandles(doc, gridId)!;
    // Mounted views retain the shared manager; mirror that so the width
    // writer's history isolation is the one production uses.
    retainGridUndoManager(grid.entry);
    let count = 0;
    doc.on("update", () => count++);
    return { doc, grid, tableId, updates: () => count };
}

function mount(f: Fixture, extra: Record<string, unknown> = {}, rows = 1) {
    const onColumnWidthPreview = vi.fn();
    let props: Record<string, unknown> = {
        grid: f.grid as GridHandles | undefined,
        handles: getTableHandles(f.doc, f.tableId)!,
        schema,
        query: QUERY,
        result: {
            columns: ["id", "title", "done"],
            rows: Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, title: `t${i}`, done: false })),
        },
        componentTypes: {},
        columnLabels: {},
        hiddenColumns: {} as Record<string, boolean>,
        columnOrder: [] as string[],
        columnWidths: readGridComponents(f.grid).widths as Record<string, number | undefined>,
        session: { resolveRelation: vi.fn() } satisfies RelationResolver,
        isReadOnly: false,
        onColumnWidthPreview,
        ...extra,
    };
    const view = render(TableGrid, { props: props as never });
    const setProps = (patch: Record<string, unknown>) => {
        props = { ...props, ...patch };
        return view.rerender(props as never);
    };
    // Mirror the committed definition the way YjsTableView does.
    f.grid.entry.observeDeep(() => {
        const mirror = readGridComponents(f.grid);
        void setProps({ columnWidths: mirror.widths, hiddenColumns: mirror.hidden });
    });
    return { ...view, setProps, onColumnWidthPreview };
}

function pointer(target: EventTarget, type: string, init: ConstructorParameters<typeof PointerEvent>[1] = {}) {
    return fireEvent(
        target as Element,
        new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            clientX: 100,
            ...init,
        }),
    );
}

function handleOf(container: HTMLElement, column: string): HTMLElement {
    const handle = container.querySelector<HTMLElement>(
        `th[data-col="${column}"] [data-testid="yjs-table-column-resize-handle"]`,
    );
    if (!handle) throw new Error(`no resize handle for ${column}`);
    return handle;
}

function colStyle(container: HTMLElement, column: string): string {
    return container.querySelector(`colgroup col[data-col="${column}"]`)?.getAttribute("style") ?? "";
}

function savedWidth(f: Fixture, column: string): unknown {
    const cfg = (f.grid.entry.get("components") as Y.Map<Y.Map<unknown>>).get(column);
    return cfg?.get("widthPx");
}

describe("TableGrid header resize", () => {
    it("previews locally without writing, then commits exactly one isolated Undo step", async () => {
        const f = fixture();
        const { container, onColumnWidthPreview } = mount(f);
        const handle = handleOf(container, "title");

        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 160 });
        await pointer(handle, "pointermove", { clientX: 217.4 });
        await tick();
        expect(colStyle(container, "title")).toContain("width: 117px");
        expect(container.querySelector('th[data-col="title"]')?.classList.contains("col-fixed")).toBe(true);
        expect(onColumnWidthPreview).toHaveBeenLastCalledWith({ column: "title", width: 117 });
        expect(f.updates()).toBe(0);
        expect(f.grid.undo.undoStack.length).toBe(0);
        expect(savedWidth(f, "title")).toBeUndefined();

        // Release away from the header still commits the final candidate.
        await pointer(document.body, "pointerup", { clientX: 230 });
        await tick();
        expect(savedWidth(f, "title")).toBe(130);
        expect(f.updates()).toBe(1);
        expect(f.grid.undo.undoStack.length).toBe(1);
        expect(onColumnWidthPreview).toHaveBeenLastCalledWith(undefined);
        expect(colStyle(container, "title")).toContain("width: 130px");

        // Duplicate terminal events after success neither write nor roll back.
        await pointer(handle, "lostpointercapture");
        await pointer(handle, "pointercancel");
        await pointer(document.body, "pointerup", { clientX: 400 });
        expect(f.updates()).toBe(1);
        expect(savedWidth(f, "title")).toBe(130);

        // One Undo restores auto (absent), not a pixel width.
        f.grid.undo.undo();
        await tick();
        expect(savedWidth(f, "title")).toBeUndefined();
        expect(container.querySelector('th[data-col="title"]')?.classList.contains("col-fixed")).toBe(false);
    });

    it("treats no net rounded change, and away-and-back, as zero-effect no-ops", async () => {
        const f = fixture();
        const { container } = mount(f);
        const handle = handleOf(container, "title");

        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(document.body, "pointerup", { clientX: 100.3 });
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 180 });
        await tick();
        expect(colStyle(container, "title")).toContain("width: 80px");
        await pointer(handle, "pointermove", { clientX: 100 });
        await pointer(document.body, "pointerup", { clientX: 100 });
        await tick();
        expect(f.updates()).toBe(0);
        expect(f.grid.undo.undoStack.length).toBe(0);
        expect(savedWidth(f, "title")).toBeUndefined();
        expect(container.querySelector('th[data-col="title"]')?.classList.contains("col-fixed")).toBe(false);
    });

    it("clamps to 32..4096 and keeps an unchanged fixed value effect-free", async () => {
        const f = fixture({ title: { widthPx: 32 } });
        const { container } = mount(f);
        const handle = handleOf(container, "title");

        // jsdom measures 0px: a leftward drag clamps to 32, equal to the
        // saved value, so the shared writer performs no update.
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 40 });
        await pointer(document.body, "pointerup", { clientX: 40 });
        expect(f.updates()).toBe(0);
        expect(savedWidth(f, "title")).toBe(32);

        await pointer(handle, "pointerdown", { clientX: 0 });
        await pointer(document.body, "pointerup", { clientX: 9000 });
        expect(savedWidth(f, "title")).toBe(4096);
        expect(f.grid.undo.undoStack.length).toBe(1);
    });

    it("Escape, pointercancel, capture loss, blur and unmount cancel without any write", async () => {
        const f = fixture({ title: { widthPx: 150 } });
        const { container, unmount } = mount(f);
        const terminals: Array<(handle: HTMLElement) => Promise<unknown>> = [
            () => fireEvent.keyDown(window, { key: "Escape" }),
            (handle) => pointer(handle, "pointercancel"),
            (handle) => pointer(handle, "lostpointercapture"),
            () => fireEvent.blur(window),
        ];
        for (const terminate of terminals) {
            const handle = handleOf(container, "title");
            await pointer(handle, "pointerdown", { clientX: 100 });
            await pointer(handle, "pointermove", { clientX: 40 });
            await tick();
            expect(colStyle(container, "title")).toContain("width: 32px");
            await terminate(handle);
            await tick();
            expect(colStyle(container, "title")).toContain("width: 150px");
            // A release after the cancellation stays a no-op and its click
            // does not select the column.
            await pointer(document.body, "pointerup", { clientX: 10 });
            await fireEvent.click(container.querySelector('th[data-col="title"]')!);
            expect(container.querySelector('th[data-col="title"]')?.classList.contains("header-selected"))
                .toBe(false);
        }
        expect(f.updates()).toBe(0);
        expect(f.grid.undo.undoStack.length).toBe(0);

        const handle = handleOf(container, "title");
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 300 });
        unmount();
        await pointer(document.body, "pointerup", { clientX: 300 });
        expect(f.updates()).toBe(0);
        expect(savedWidth(f, "title")).toBe(150);
    });

    it("an observed same-column width change cancels for good; disjoint changes are preserved", async () => {
        const f = fixture({ title: { widthPx: 150 } });
        const { container } = mount(f);
        const handle = handleOf(container, "title");

        // Peer A -> B -> A while the gesture is pending: it cannot regain
        // authority when the old number returns.
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 250 });
        setGridColumnWidth(f.grid, "title", 210);
        await tick();
        expect(colStyle(container, "title")).toContain("width: 210px");
        setGridColumnWidth(f.grid, "title", 150);
        const before = f.updates();
        await pointer(document.body, "pointerup", { clientX: 250 });
        expect(f.updates()).toBe(before);
        expect(savedWidth(f, "title")).toBe(150);

        // Label, another column's width, and a reorder while the target
        // stays rendered leave the gesture bound to the exact column.
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 160 });
        setGridComponentField(f.grid, "title", "label", "Name");
        setGridColumnWidth(f.grid, "done", 64);
        await pointer(document.body, "pointerup", { clientX: 170 });
        expect(savedWidth(f, "title")).toBe(70);
        expect(savedWidth(f, "done")).toBe(64);
        expect(readGridComponents(f.grid).labels.title).toBe("Name");
    });

    it("hiding the target or replacing the Grid entry invalidates the gesture", async () => {
        const f = fixture();
        const { container } = mount(f);
        let handle = handleOf(container, "title");
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 200 });
        setGridComponentField(f.grid, "title", "hidden", true);
        await tick();
        setGridComponentField(f.grid, "title", "hidden", undefined);
        await tick();
        const before = f.updates();
        await pointer(document.body, "pointerup", { clientX: 200 });
        expect(f.updates()).toBe(before);
        expect(savedWidth(f, "title")).toBeUndefined();

        handle = handleOf(container, "title");
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 200 });
        const replacement = new Y.Map<unknown>();
        replacement.set("components", new Y.Map());
        getGridRegistry(f.doc).set(f.grid.gridId, replacement);
        const afterReplace = f.updates();
        await pointer(document.body, "pointerup", { clientX: 200 });
        expect(f.updates()).toBe(afterReplace);
        expect((replacement.get("components") as Y.Map<unknown>).size).toBe(0);
    });

    it("turning the host read-only cancels and removes the handles", async () => {
        const f = fixture();
        const { container, setProps } = mount(f);
        const handle = handleOf(container, "title");
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 200 });
        await setProps({ isReadOnly: true });
        await tick();
        expect(container.querySelector('[data-testid="yjs-table-column-resize-handle"]')).toBeNull();
        await pointer(document.body, "pointerup", { clientX: 200 });
        expect(f.updates()).toBe(0);
    });

    it("offers handles for every data column with zero rows, none on utility columns, raw tables or non-primary buttons", async () => {
        const f = fixture();
        const { container } = mount(f, {}, 0);
        const handles = Array.from(
            container.querySelectorAll<HTMLElement>('[data-testid="yjs-table-column-resize-handle"]'),
        );
        expect(handles.map((h) => h.dataset.col)).toEqual(["id", "title", "done"]);
        expect(container.querySelector('.selection-header [data-testid="yjs-table-column-resize-handle"]')).toBeNull();

        await pointer(handleOf(container, "done"), "pointerdown", { button: 2, clientX: 0 });
        await pointer(document.body, "pointerup", { button: 2, clientX: 200 });
        await pointer(handleOf(container, "done"), "pointerdown", { isPrimary: false, clientX: 0 });
        await pointer(document.body, "pointerup", { isPrimary: false, clientX: 200 });
        expect(f.updates()).toBe(0);

        // Final column with zero rows still resizes.
        await pointer(handleOf(container, "done"), "pointerdown", { pointerType: "pen", clientX: 0 });
        await pointer(document.body, "pointerup", { pointerType: "pen", clientX: 90 });
        expect(savedWidth(f, "done")).toBe(90);

        const raw = fixture();
        const rawView = mount(raw, { grid: undefined });
        expect(rawView.container.querySelector('[data-testid="yjs-table-column-resize-handle"]')).toBeNull();
        const readOnly = fixture();
        const roView = mount(readOnly, { isReadOnly: true });
        expect(roView.container.querySelector('[data-testid="yjs-table-column-resize-handle"]')).toBeNull();
    });

    it("the release click neither selects nor reorders a column", async () => {
        const f = fixture();
        const { container } = mount(f);
        const handle = handleOf(container, "title");
        const header = container.querySelector('th[data-col="title"]')!;
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 150 });
        await pointer(handle, "pointerup", { clientX: 150 });
        await fireEvent.click(handle);
        await tick();
        expect(header.classList.contains("header-selected")).toBe(false);
        expect(f.grid.entry.get("columnOrder")).toBeUndefined();
        expect(savedWidth(f, "title")).toBe(50);

        // Normal header selection still works afterwards.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await fireEvent.click(header);
        await tick();
        expect(header.classList.contains("header-selected")).toBe(true);
    });
    it("a cancelled gesture's release guard never consumes a later, unrelated interaction", async () => {
        const f = fixture({ title: { widthPx: 150 } });
        const { container, unmount } = mount(f);
        const header = container.querySelector('th[data-col="title"]')!;
        const handle = handleOf(container, "title");
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 160 });
        // Blur cancels; the original release happens outside the window,
        // so this document never sees its pointerup.
        await fireEvent.blur(window);
        await tick();
        // A fresh pointer sequence (same mouse pointer id) on the header:
        // its release and click must reach the header normally.
        await pointer(header, "pointerdown", { clientX: 20 });
        await pointer(header, "pointerup", { clientX: 20 });
        await fireEvent.click(header);
        await tick();
        expect(header.classList.contains("header-selected")).toBe(true);
        expect(f.updates()).toBe(0);

        // Unmount after a cancel leaves no window listener behind.
        const again = handleOf(container, "title");
        await pointer(again, "pointerdown", { clientX: 100 });
        await pointer(again, "pointermove", { clientX: 160 });
        await fireEvent.blur(window);
        unmount();
        const clicks = vi.fn();
        document.body.addEventListener("click", clicks);
        await pointer(document.body, "pointerup", { clientX: 160 });
        await fireEvent.click(document.body);
        document.body.removeEventListener("click", clicks);
        expect(clicks).toHaveBeenCalledTimes(1);
        expect(f.updates()).toBe(0);
    });

    it("an observed source-Table rebinding invalidates the gesture for good", async () => {
        const f = fixture({ title: { widthPx: 150 } });
        const { container } = mount(f);
        const original = f.grid.entry.get("sourceTableId");
        const otherTable = createTable(f.doc, "Other", "other");
        const handle = handleOf(container, "title");
        await pointer(handle, "pointerdown", { clientX: 100 });
        await pointer(handle, "pointermove", { clientX: 180 });
        await tick();
        // jsdom measures 0px: the candidate is the 80px displacement.
        expect(colStyle(container, "title")).toContain("width: 80px");
        // A -> B -> A on the same live entry: the old binding returning does
        // not revive the gesture.
        f.grid.entry.set("sourceTableId", otherTable);
        await tick();
        expect(colStyle(container, "title")).toContain("width: 150px");
        f.grid.entry.set("sourceTableId", original);
        const before = f.updates();
        const history = f.grid.undo.undoStack.length;
        await pointer(document.body, "pointerup", { clientX: 180 });
        expect(f.updates()).toBe(before);
        expect(savedWidth(f, "title")).toBe(150);
        expect(f.grid.undo.undoStack.length).toBe(history);
    });

    it("a subpixel move that keeps the rounded measured width is a no-op on an auto column", async () => {
        expect(resizeCandidate(100.625, 0.625)).toBeUndefined();
        expect(resizeCandidate(100.625, -0.1)).toBeUndefined();
        expect(resizeCandidate(100.625, 1)).toBe(102);
        expect(resizeCandidate(100.4, 0.05)).toBeUndefined();
        expect(resizeCandidate(100.4, 0.2)).toBe(101);

        const f = fixture();
        const { container } = mount(f);
        const header = container.querySelector<HTMLElement>('th[data-col="title"]')!;
        // jsdom has no layout: give the header the fractional border-box
        // width a browser would measure for an auto column.
        header.getBoundingClientRect = () => ({ width: 100.625 }) as DOMRect;
        const handle = handleOf(container, "title");
        await pointer(handle, "pointerdown", { pointerType: "pen", clientX: 100 });
        await pointer(handle, "pointermove", { pointerType: "pen", clientX: 100.625 });
        await pointer(document.body, "pointerup", { pointerType: "pen", clientX: 100.625 });
        await tick();
        expect(f.updates()).toBe(0);
        expect(f.grid.undo.undoStack.length).toBe(0);
        expect(savedWidth(f, "title")).toBeUndefined();
        expect(header.classList.contains("col-fixed")).toBe(false);
    });
});
