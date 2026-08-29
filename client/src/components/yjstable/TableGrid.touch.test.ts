import { fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import TableGrid from "./TableGrid.svelte";

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id uuid, name text, status text);",
    columns: ["id", "name", "status"].map((name, index) => ({
        name,
        dataType: index === 0 ? "uuid" : "text",
        isNullable: index !== 0,
        isPrimaryKey: index === 0,
        kind: "text" as const,
        checkOptions: [],
    })),
};

function setup() {
    const doc = new Y.Doc();
    const handles = getTableHandles(doc, createTable(doc, "tasks", "tasks"))!;
    return render(TableGrid, {
        props: {
            handles,
            schema,
            query: "SELECT id, name, status FROM tasks",
            result: {
                columns: ["id", "name", "status"],
                rows: [
                    { id: "a", name: "Alpha", status: "Open" },
                    { id: "b", name: "Beta", status: "Done" },
                ],
            },
            componentTypes: {},
            columnLabels: {},
            hiddenColumns: {},
            columnOrder: [],
            session: { resolveRelation: vi.fn() } satisfies RelationResolver,
        },
    });
}

function touch(target: Element, type: "pointerdown" | "pointermove" | "pointerup", init = {}) {
    return fireEvent(
        target,
        new PointerEvent(type, {
            bubbles: true,
            pointerType: "touch",
            pointerId: 7,
            clientX: 20,
            clientY: 20,
            ...init,
        }),
    );
}

afterEach(() => vi.useRealTimers());

describe("TableGrid touch selection", () => {
    it("uses one tap for activation and a second tap for native editing", async () => {
        vi.useFakeTimers();
        const view = setup();
        const cell = view.container.querySelector<HTMLElement>('td[data-row-id="a"][data-col="name"]')!;

        await touch(cell, "pointerdown");
        await touch(cell, "pointerup");
        await fireEvent.click(cell.querySelector("button")!);
        expect(cell.classList.contains("grid-active")).toBe(true);
        expect(cell.querySelector("input")).toBeNull();

        vi.advanceTimersByTime(100);
        await touch(cell, "pointerdown");
        await touch(cell, "pointerup");
        await vi.runAllTimersAsync();
        expect(cell.querySelector("input.cell-input")).not.toBeNull();
        expect(cell.getAttribute("aria-selected")).toBe("true");
    });

    it("long-presses into range mode with accessible resize handles and toolbar", async () => {
        vi.useFakeTimers();
        const view = setup();
        const cell = view.container.querySelector<HTMLElement>('td[data-row-id="a"][data-col="name"]')!;
        await touch(cell, "pointerdown");
        await vi.advanceTimersByTimeAsync(500);

        expect(view.getByRole("toolbar", { name: "Grid selection actions" })).toBeTruthy();
        expect(view.getByRole("button", { name: "Resize selection from start" })).toBeTruthy();
        expect(view.getByRole("button", { name: "Resize selection from end" })).toBeTruthy();
        expect(view.getByRole("button", { name: "Add selection" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("gives a moved touch gesture to scrolling instead of changing selection", async () => {
        vi.useFakeTimers();
        const view = setup();
        const cell = view.container.querySelector<HTMLElement>('td[data-row-id="a"][data-col="name"]')!;
        await touch(cell, "pointerdown");
        await touch(cell, "pointermove", { clientY: 45 });
        await vi.advanceTimersByTimeAsync(600);

        expect(view.queryByRole("toolbar", { name: "Grid selection actions" })).toBeNull();
        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(0);
    });

    it("supports additive row and column header taps without modifier keys", async () => {
        vi.useFakeTimers();
        const view = setup();
        const cell = view.container.querySelector<HTMLElement>('td[data-row-id="a"][data-col="name"]')!;
        await touch(cell, "pointerdown");
        await vi.advanceTimersByTimeAsync(500);
        await fireEvent.click(view.getByRole("button", { name: "Add selection" }));
        await fireEvent.click(view.getByRole("rowheader", { name: "Select row 1" }));
        await fireEvent.click(view.getByRole("rowheader", { name: "Select row 2" }));

        expect(view.container.querySelectorAll("th.row-header.header-selected")).toHaveLength(2);
        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(6);
    });
});
