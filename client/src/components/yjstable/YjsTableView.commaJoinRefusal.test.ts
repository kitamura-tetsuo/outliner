// Comma-joined Grid refusal on the production surface (issue #5547): the
// mounted YjsTableView — the component behind both the embedded Grid block
// and the standalone `/-/grids/[gridId]` route (via GridDetailView) — moves
// through a real saved-query transition, completes the comma query against
// PGlite, and then refuses ordinary writes while keeping the combined result
// readable and copyable. Table state and data-Undo stacks are observed
// directly; the saved query and source binding must not move.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
    createGrid,
    getGridHandles,
    getGridQuery,
    getGridSourceTableId,
    setGridQuery,
} from "../../services/yjstable/gridDocs";
import { collectGridRenderTraces } from "../../services/yjstable/gridRenderTraceRegistry";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import {
    addRecord,
    createTable,
    getTableHandles,
    setSchemaText,
    type TableHandles,
} from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests, waitForTableEngineIdle } from "../../services/yjstable/tableEngine";
import YjsTableView from "./YjsTableView.svelte";

// The UI Definition panel embeds the shared Monaco SQL editor; see
// SqlEditor.test.ts for why the runtime is faked under jsdom.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

/** Minimal stub of the real `ClipboardItem` API (missing in jsdom). */
class StubClipboardItem {
    constructor(private readonly parts: Record<string, Blob>) {}
    getType(mime: string): Promise<Blob> {
        return Promise.resolve(this.parts[mime]);
    }
}

const SCHEMA_A = "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)";
const SCHEMA_B = "CREATE TABLE tasks_b (id TEXT PRIMARY KEY, title TEXT)";
const BASE_A = "SELECT id, title FROM tasks_a";
const COMMA_QUERY = "SELECT a.id, a.title FROM tasks_a AS a, tasks_b AS b";
const NESTED_COMMA_QUERY =
    "SELECT a.id, a.title FROM tasks_a AS a /* outer /* inner */ WHERE ignored */ , tasks_b AS b LIMIT 1";

/** Two Tables with identical columns and one overlapping record id. B holds two records. */
function seedTables(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableA = createTable(projectDoc, "Table A", "tasks_a");
    const tableB = createTable(projectDoc, "Table B", "tasks_b");
    const handlesA = getTableHandles(projectDoc, tableA)!;
    const handlesB = getTableHandles(projectDoc, tableB)!;
    setSchemaText(handlesA, SCHEMA_A);
    setSchemaText(handlesB, SCHEMA_B);
    addRecord(handlesA, { title: "Value in A" }, "r1");
    addRecord(handlesB, { title: "Value from B" }, "r1");
    addRecord(handlesB, { title: "Second in B" }, "r2");
    return { projectDoc, tableA, handlesA, handlesB };
}

function undoDepths(handlesA: TableHandles, handlesB: TableHandles) {
    return [handlesA.undo.undoStack.length, handlesB.undo.undoStack.length];
}

/** Mount the embedded Grid surface for a Grid bound to Table A. */
function mountEmbedded(
    projectDoc: Y.Doc,
    tableA: string,
    handlesA: TableHandles,
    query: string,
) {
    const gridId = createGrid(projectDoc, tableA, { name: "Grid", query });
    const grid = getGridHandles(projectDoc, gridId)!;
    const view = render(YjsTableView, {
        props: { grid, handles: handlesA, projectDoc, tableName: "Table A", sqlName: "tasks_a" },
    });
    return { gridId, grid, view };
}

/** Barrier: the view's latest execution stage must be observed. */
function executionFor(gridId: string) {
    return collectGridRenderTraces().find((candidate) => candidate.gridId === gridId)?.stages.find((
        candidate,
    ) => candidate.stage === "query-execution");
}

async function awaitCompletedQuery(gridId: string, query: string): Promise<string> {
    let queryId = "";
    await waitFor(() => {
        const exec = executionFor(gridId);
        expect(exec?.status).toBe("completed");
        expect(exec?.query).toBe(query);
        expect(exec?.queryId).toBeDefined();
        queryId = exec?.queryId ?? "";
    }, { timeout: 30000 });
    return queryId;
}

/** Rendered snapshot for one completed execution: actual row data behind the DOM. */
function renderStageFor(gridId: string, queryId: string) {
    return collectGridRenderTraces().find((candidate) => candidate.gridId === gridId)?.stages.find((
        candidate,
    ) => candidate.stage === "render" && candidate.queryId === queryId);
}

afterEach(async () => {
    vi.unstubAllGlobals();
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("comma-joined Grid refusal on the production surface (issue #5547)", { timeout: 120000 }, () => {
    it("shows the combined result but refuses ordinary cell commits and deletion after an editor transition", async () => {
        const { projectDoc, tableA, handlesA, handlesB } = seedTables("proj-comma-view-transition");
        const { gridId, grid, view } = mountEmbedded(projectDoc, tableA, handlesA, BASE_A);
        const surface = () => view.getByTestId("yjs-table-view");
        const titleButtons = () =>
            Array.from(
                surface().querySelectorAll('tbody tr td[data-col="title"] button.cell-value'),
            ) as HTMLButtonElement[];
        try {
            // Writable single-Table baseline through the real runner.
            await waitFor(() => expect(titleButtons()[0]?.textContent).toBe("Value in A"), { timeout: 30000 });
            expect(view.queryByTestId("grid-readonly-reason")).toBeNull();
            const undoBefore = undoDepths(handlesA, handlesB);

            // The real saved-query transition: the production writer the
            // Query editor (TableUiDefEditor) calls, not a fabricated flag.
            setGridQuery(grid, COMMA_QUERY);
            expect(getGridQuery(grid)).toBe(COMMA_QUERY);
            const queryId = await awaitCompletedQuery(gridId, COMMA_QUERY);

            // The rendered result really is the combined cross join, with the
            // expected duplicate A identity — and it explains its provenance.
            const render = renderStageFor(gridId, queryId);
            expect(render?.stage).toBe("render");
            if (render?.stage !== "render") throw new Error("expected a render stage");
            expect(render.rowCount).toBe(2);
            expect(render.sample.map((row) => row.id)).toEqual(["r1", "r1"]);
            await waitFor(
                () =>
                    expect(view.queryByTestId("grid-readonly-reason")?.textContent).toMatch(
                        /multiple sources|several tables/,
                    ),
                { timeout: 30000 },
            );
            expect(titleButtons().length).toBeGreaterThan(0);
            for (const button of titleButtons()) expect(button.textContent).toBe("Value in A");

            // An ordinary cell commit opens no editor and writes nothing.
            await fireEvent.click(titleButtons()[0]!);
            await fireEvent.keyDown(titleButtons()[0]!, { key: "Enter" });
            expect(surface().querySelector("input.cell-input")).toBeNull();
            expect(handlesA.data.get("r1")?.get("title")).toBe("Value in A");
            expect(handlesB.data.get("r1")?.get("title")).toBe("Value from B");
            expect(handlesB.data.get("r2")?.get("title")).toBe("Second in B");
            expect(undoDepths(handlesA, handlesB)).toEqual(undoBefore);

            // Row deletion through the ordinary UI is refused the same way.
            const rowHeader = surface().querySelector("th.row-header") as HTMLElement | null;
            expect(rowHeader).not.toBeNull();
            await fireEvent.click(rowHeader!);
            await fireEvent.keyDown(rowHeader!, { key: "Delete" });
            expect(handlesA.data.has("r1")).toBe(true);
            expect(handlesB.data.size).toBe(2);
            expect(undoDepths(handlesA, handlesB)).toEqual(undoBefore);

            // Neither the saved query nor the source binding moved.
            expect(getGridQuery(grid)).toBe(COMMA_QUERY);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);
        } finally {
            view.unmount();
            await waitForTableEngineIdle();
        }
    });

    it("refuses a cell edit pending across the transition to a comma query", async () => {
        const { projectDoc, tableA, handlesA, handlesB } = seedTables("proj-comma-view-pending");
        const { gridId, grid, view } = mountEmbedded(projectDoc, tableA, handlesA, BASE_A);
        const surface = () => view.getByTestId("yjs-table-view");
        const titleButton = () =>
            surface().querySelector('tr[data-record-id="r1"] td[data-col="title"] button.cell-value') as
                | HTMLButtonElement
                | null;
        try {
            await waitFor(() => expect(titleButton()?.textContent).toBe("Value in A"), { timeout: 30000 });
            const undoBefore = undoDepths(handlesA, handlesB);

            // Begin an ordinary edit while the single-Table result is current.
            await fireEvent.click(titleButton()!);
            const pendingInput = surface().querySelector("input.cell-input") as HTMLInputElement | null;
            expect(pendingInput).not.toBeNull();
            await fireEvent.input(pendingInput!, { target: { value: "Stale attempt" } });

            // The saved query becomes the comma join while re-execution is
            // pending: the view revokes the old execution synchronously.
            setGridQuery(grid, COMMA_QUERY);
            await tick();
            expect(getGridQuery(grid)).toBe(COMMA_QUERY);
            expect(surface().querySelector("input.cell-input")).toBeNull();

            // The stale edit cannot commit while the new query is observed.
            const anyTitleButton = () =>
                surface().querySelector('tbody tr td[data-col="title"] button.cell-value') as
                    | HTMLButtonElement
                    | null;
            await fireEvent.click(anyTitleButton()!);
            await tick();
            expect(surface().querySelector("input.cell-input")).toBeNull();

            // And it stays refused after the combined result completes.
            await awaitCompletedQuery(gridId, COMMA_QUERY);
            await waitFor(
                () =>
                    expect(view.queryByTestId("grid-readonly-reason")?.textContent).toMatch(
                        /multiple sources|several tables/,
                    ),
                { timeout: 30000 },
            );
            await fireEvent.click(anyTitleButton()!);
            await tick();
            expect(surface().querySelector("input.cell-input")).toBeNull();
            expect(handlesA.data.get("r1")?.get("title")).toBe("Value in A");
            expect(handlesB.data.get("r1")?.get("title")).toBe("Value from B");
            expect(undoDepths(handlesA, handlesB)).toEqual(undoBefore);
            expect(getGridQuery(grid)).toBe(COMMA_QUERY);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);
        } finally {
            view.unmount();
            await waitForTableEngineIdle();
        }
    });

    it("keeps the embedded surface readable, copyable, and non-writable for a nested-comment comma query", async () => {
        // This mount exercises the embedded YjsTableView boundary directly
        // with the nested-comment variant (issue #5547 REQ-001). Standalone
        // `/-/grids/[gridId]` (GridDetailView) refusal is covered by the
        // dedicated route spec alongside it.
        const { projectDoc, tableA, handlesA, handlesB } = seedTables("proj-comma-view-standalone");
        const { gridId, grid, view } = mountEmbedded(projectDoc, tableA, handlesA, BASE_A);
        const surface = () => view.getByTestId("yjs-table-view");
        try {
            await waitFor(
                () =>
                    expect(
                        surface().querySelector('tbody tr td[data-col="title"] button.cell-value')?.textContent,
                    ).toBe("Value in A"),
                { timeout: 30000 },
            );
            const undoBefore = undoDepths(handlesA, handlesB);

            setGridQuery(grid, NESTED_COMMA_QUERY);
            expect(getGridQuery(grid)).toBe(NESTED_COMMA_QUERY);
            await awaitCompletedQuery(gridId, NESTED_COMMA_QUERY);
            await waitFor(
                () =>
                    expect(view.queryByTestId("grid-readonly-reason")?.textContent).toMatch(
                        /multiple sources|several tables/,
                    ),
                { timeout: 30000 },
            );
            // LIMIT 1 leaves a single combined row: cardinality is not proof.
            expect(
                surface().querySelectorAll('tbody tr td[data-col="title"] button.cell-value'),
            ).toHaveLength(1);

            // The queried row stays selectable and copyable through the real copy path.
            const write = vi.fn().mockResolvedValue(undefined);
            vi.stubGlobal("ClipboardItem", StubClipboardItem);
            Object.defineProperty(navigator, "clipboard", {
                value: { write, readText: vi.fn().mockResolvedValue("") },
                configurable: true,
            });
            const cell = surface().querySelector('tbody tr td[data-col="title"]') as HTMLElement;
            await fireEvent.click(cell);
            await fireEvent.keyDown(cell.querySelector("button")!, { key: "c", ctrlKey: true });
            await waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 10000 });
            const item = write.mock.calls[0][0][0] as ClipboardItem;
            expect(await (await item.getType("text/plain")).text()).toContain("Value in A");

            // But an ordinary title commit writes nothing.
            await fireEvent.click(cell.querySelector("button")!);
            expect(surface().querySelector("input.cell-input")).toBeNull();
            expect(handlesA.data.get("r1")?.get("title")).toBe("Value in A");
            expect(handlesB.data.get("r1")?.get("title")).toBe("Value from B");
            expect(undoDepths(handlesA, handlesB)).toEqual(undoBefore);
            expect(getGridQuery(grid)).toBe(NESTED_COMMA_QUERY);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);
        } finally {
            view.unmount();
            await waitForTableEngineIdle();
        }
    });

    it("copies each duplicate cross-join occurrence independently while refusing writes", async () => {
        // Both result occurrences share the bare id r1, but their
        // other_title values differ per joined B row. Selection and copy
        // must address occurrences, not the shared logical id, or every
        // occurrence would copy the last row's value (issue #5547 REQ-002).
        const projectDoc = new Y.Doc({ guid: "proj-comma-view-duplicate-copy" });
        const tableA = createTable(projectDoc, "Table A", "tasks_a");
        const tableB = createTable(projectDoc, "Table B", "tasks_b");
        const handlesA = getTableHandles(projectDoc, tableA)!;
        const handlesB = getTableHandles(projectDoc, tableB)!;
        setSchemaText(handlesA, SCHEMA_A);
        setSchemaText(handlesB, SCHEMA_B);
        addRecord(handlesA, { title: "Value in A" }, "r1");
        addRecord(handlesB, { title: "First" }, "b1");
        addRecord(handlesB, { title: "Second" }, "b2");
        const query = "SELECT a.id, a.title, b.title AS other_title FROM tasks_a AS a, tasks_b AS b ORDER BY b.id";
        const { gridId, grid, view } = mountEmbedded(projectDoc, tableA, handlesA, BASE_A);
        const surface = () => view.getByTestId("yjs-table-view");
        const otherCells = () =>
            Array.from(
                surface().querySelectorAll('tbody tr td[data-col="other_title"]'),
            ) as HTMLElement[];
        try {
            setGridQuery(grid, query);
            expect(getGridQuery(grid)).toBe(query);
            const completedId = await awaitCompletedQuery(gridId, query);
            const render = renderStageFor(gridId, completedId);
            if (render?.stage !== "render") throw new Error("expected a render stage");
            expect(render.rowCount).toBe(2);
            expect(render.sample.map((row) => row.id)).toEqual(["r1", "r1"]);
            await waitFor(
                () =>
                    expect(view.queryByTestId("grid-readonly-reason")?.textContent).toMatch(
                        /multiple sources|several tables/,
                    ),
                { timeout: 30000 },
            );
            await waitFor(() => expect(otherCells()).toHaveLength(2), { timeout: 30000 });
            expect(otherCells()[0]?.textContent).toContain("First");
            expect(otherCells()[1]?.textContent).toContain("Second");
            const undoBefore = undoDepths(handlesA, handlesB);

            const write = vi.fn().mockResolvedValue(undefined);
            vi.stubGlobal("ClipboardItem", StubClipboardItem);
            Object.defineProperty(navigator, "clipboard", {
                value: { write, readText: vi.fn().mockResolvedValue("") },
                configurable: true,
            });
            const payloadText = async () => {
                await waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 10000 });
                const item = write.mock.calls[write.mock.calls.length - 1][0][0] as ClipboardItem;
                return await (await item.getType("text/plain")).text();
            };

            // First occurrence copies First only.
            await fireEvent.click(otherCells()[0]!);
            await fireEvent.keyDown(otherCells()[0]!.querySelector("button")!, { key: "c", ctrlKey: true });
            expect(await payloadText()).toBe("First");
            write.mockClear();

            // Second occurrence copies Second only.
            await fireEvent.click(otherCells()[1]!);
            await fireEvent.keyDown(otherCells()[1]!.querySelector("button")!, { key: "c", ctrlKey: true });
            expect(await payloadText()).toBe("Second");
            write.mockClear();

            // A range over both occurrences preserves order and values.
            await fireEvent.click(otherCells()[0]!);
            await fireEvent.click(otherCells()[1]!, { shiftKey: true });
            await fireEvent.keyDown(otherCells()[1]!.querySelector("button")!, { key: "c", ctrlKey: true });
            expect(await payloadText()).toBe("First\nSecond");

            // Nothing was written through the refused result.
            expect(handlesA.data.get("r1")?.get("title")).toBe("Value in A");
            expect(handlesB.data.get("b1")?.get("title")).toBe("First");
            expect(handlesB.data.get("b2")?.get("title")).toBe("Second");
            expect(undoDepths(handlesA, handlesB)).toEqual(undoBefore);
            expect(getGridQuery(grid)).toBe(query);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);
        } finally {
            view.unmount();
            await waitForTableEngineIdle();
        }
    });
});
