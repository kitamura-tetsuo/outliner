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

const SCHEMA_A = "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)";
const BASE_A = "SELECT id, title FROM tasks_a";
const QUERY_B = "SELECT id, title FROM tasks_b";

/** Two Tables with identical columns and one overlapping record id, different titles. */
function seedOverlappingTables(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableA = createTable(projectDoc, "Table A", "tasks_a");
    const tableB = createTable(projectDoc, "Table B", "tasks_b");
    const handlesA = getTableHandles(projectDoc, tableA)!;
    const handlesB = getTableHandles(projectDoc, tableB)!;
    setSchemaText(handlesA, SCHEMA_A);
    setSchemaText(handlesB, "CREATE TABLE tasks_b (id TEXT PRIMARY KEY, title TEXT)");
    addRecord(handlesA, { title: "Value in A" }, "r1");
    addRecord(handlesB, { title: "Value from B" }, "r1");
    return { projectDoc, tableA, handlesA, handlesB };
}

function titleOf(handles: TableHandles): unknown {
    return handles.data.get("r1")?.get("title");
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("query-revision revocation (issue #5525 REQ-003)", { timeout: 60000 }, () => {
    it("A -> B -> A revokes padded authority until a fresh execution completes", async () => {
        const { projectDoc, tableA, handlesA, handlesB } = seedOverlappingTables("proj-query-revision-revocation");
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: BASE_A });
        const grid = getGridHandles(projectDoc, gridId)!;
        const paddedA = `${BASE_A} `;

        const { getByTestId, queryByTestId, unmount } = render(YjsTableView, {
            props: { grid, handles: handlesA, projectDoc, tableName: "Table A", sqlName: "tasks_a" },
        });
        const view = () => getByTestId("yjs-table-view");
        const titleCell = () => view().querySelector('tr[data-record-id="r1"] td[data-col="title"]');
        const titleButton = () => titleCell()?.querySelector("button.cell-value") as HTMLButtonElement | null;
        // While authority is revoked the grid withholds record identity, so no
        // `tr[data-record-id]` exists: address the single title cell directly.
        const anyTitleButton = () =>
            view().querySelector('tbody tr td[data-col="title"] button.cell-value') as HTMLButtonElement | null;
        // Live view mirrors via the production render-trace registry: each
        // completed run mints a fresh `query-<generation>` id, so waiting for
        // the id to advance proves a NEW execution completed — a stale
        // pre-flush DOM cannot satisfy that.
        const traceExecution = () => {
            const trace = collectGridRenderTraces().find(candidate => candidate.gridId === gridId);
            const stage = trace?.stages.find(candidate => candidate.stage === "query-execution");
            return stage?.stage === "query-execution" ? stage : undefined;
        };
        try {
            // Writable baseline, then the reported padded SELECT through the production writer.
            await waitFor(() => expect(titleButton()?.textContent).toBe("Value in A"), { timeout: 30000 });
            const baselineExec = traceExecution();
            expect(baselineExec?.status).toBe("completed");
            expect(baselineExec?.query).toBe(BASE_A);
            setGridQuery(grid, paddedA);
            expect(getGridQuery(grid)).toBe(paddedA);
            await waitFor(() => {
                const exec = traceExecution();
                expect(exec?.status).toBe("completed");
                expect(exec?.query).toBe(BASE_A);
                expect(exec?.queryId).toBeDefined();
                expect(exec?.queryId).not.toBe(baselineExec?.queryId);
                expect(queryByTestId("grid-readonly-reason")).toBeNull();
            }, { timeout: 30000 });
            const paddedExec = traceExecution();
            expect(titleButton()?.getAttribute("aria-disabled")).not.toBe("true");
            const undoA = handlesA.undo.undoStack.length;
            const undoB = handlesB.undo.undoStack.length;

            // Begin a pending mutation, then move the saved query A -> B -> A in
            // separate transactions while the replacement execution is pending.
            await fireEvent.click(titleButton()!);
            const pendingInput = view().querySelector("input.cell-input") as HTMLInputElement | null;
            expect(pendingInput).not.toBeNull();
            await fireEvent.input(pendingInput!, { target: { value: "Stale attempt" } });
            setGridQuery(grid, QUERY_B);
            setGridQuery(grid, paddedA);
            await tick();

            // Both transitions revoked the old execution: returning to matching
            // text alone does not revive the outstanding mutation.
            expect(getGridQuery(grid)).toBe(paddedA);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);
            expect(view().querySelector("input.cell-input")).toBeNull();
            expect(queryByTestId("grid-readonly-reason")?.textContent).toMatch(/provenance has not been validated/);
            expect(anyTitleButton()?.getAttribute("aria-disabled")).toBe("true");
            // The outstanding edit cannot commit while authority is revoked.
            await fireEvent.click(anyTitleButton()!);
            await tick();
            expect(view().querySelector("input.cell-input")).toBeNull();
            expect(titleOf(handlesA)).toBe("Value in A");
            expect(titleOf(handlesB)).toBe("Value from B");
            expect(handlesA.undo.undoStack.length).toBe(undoA);
            expect(handlesB.undo.undoStack.length).toBe(undoB);

            // Release the replacement execution, then a newly initiated action writes only to A.
            // The execution id must advance again: matching text alone never
            // revives the revoked generation as the current authority.
            await waitFor(() => {
                const exec = traceExecution();
                expect(exec?.status).toBe("completed");
                expect(exec?.query).toBe(BASE_A);
                expect(exec?.queryId).toBeDefined();
                expect(exec?.queryId).not.toBe(paddedExec?.queryId);
                expect(queryByTestId("grid-readonly-reason")).toBeNull();
            }, { timeout: 30000 });
            await fireEvent.click(titleButton()!);
            const freshInput = view().querySelector("input.cell-input") as HTMLInputElement | null;
            expect(freshInput).not.toBeNull();
            await fireEvent.input(freshInput!, { target: { value: "Fresh edit" } });
            await fireEvent.keyDown(freshInput!, { key: "Enter" });
            await waitFor(() => expect(titleButton()?.textContent).toBe("Fresh edit"), { timeout: 30000 });
            expect(titleOf(handlesA)).toBe("Fresh edit");
            expect(titleOf(handlesB)).toBe("Value from B");
            expect(getGridQuery(grid)).toBe(paddedA);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);

            // A relevant schema change revokes authority until a fresh execution validates it.
            setSchemaText(handlesA, SCHEMA_A.replace("title TEXT", "title TEXT, note TEXT"));
            await waitFor(() => expect(queryByTestId("grid-readonly-reason")).not.toBeNull(), { timeout: 30000 });
            setSchemaText(handlesA, SCHEMA_A);
            await waitFor(() => expect(queryByTestId("grid-readonly-reason")).toBeNull(), { timeout: 30000 });
            expect(titleButton()?.textContent).toBe("Fresh edit");
        } finally {
            unmount();
            await waitForTableEngineIdle();
        }
    });
});
