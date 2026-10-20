import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, setGridQuery } from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests, waitForTableEngineIdle } from "../../services/yjstable/tableEngine";
import YjsTableView from "./YjsTableView.svelte";

const metadataDeliveries = vi.hoisted(() => ({
    pending: [] as Array<{ value: { status: string; }; release: () => void; }>,
}));

// Instrument the real resolver at its delivery boundary. Its actual Yjs/PGlite
// work and verdict finish first; only delivery of that verdict to the mounted
// production component is gated.
vi.mock("../../services/yjstable/gridMetadataResolver", async importOriginal => {
    const actual = await importOriginal<typeof import("../../services/yjstable/gridMetadataResolver")>();
    return {
        ...actual,
        createGridMetadataResolver: (...args: Parameters<typeof actual.createGridMetadataResolver>) => {
            const resolver = actual.createGridMetadataResolver(...args);
            return {
                ...resolver,
                async resolve(...resolveArgs: Parameters<typeof resolver.resolve>) {
                    const value = await resolver.resolve(...resolveArgs);
                    await new Promise<void>(release => metadataDeliveries.pending.push({ value, release }));
                    return value;
                },
            };
        },
    };
});

vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then(module => module.fakeMonaco),
}));
vi.mock("echarts", () => ({
    init: vi.fn(() => ({ setOption: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
}));

function salesProject(name: string) {
    const projectDoc = new Y.Doc({ guid: name });
    const tableId = createTable(projectDoc, "Sales source", "sales");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(table, "CREATE TABLE sales (id TEXT PRIMARY KEY, month TEXT NOT NULL, revenue INTEGER NOT NULL)");
    addRecord(table, { month: "Jan", revenue: 120 }, "jan");
    addRecord(table, { month: "Feb", revenue: 180 }, "feb");
    const gridId = createGrid(projectDoc, undefined, {
        name: "Sales",
        query: "SELECT id, month, revenue FROM sales ORDER BY month DESC",
    });
    return { projectDoc, grid: getGridHandles(projectDoc, gridId)! };
}

async function nextDelivery(index: number) {
    await waitFor(() => expect(metadataDeliveries.pending.length).toBeGreaterThan(index), { timeout: 30_000 });
    return metadataDeliveries.pending[index];
}

beforeEach(() => metadataDeliveries.pending.splice(0));
afterEach(async () => {
    for (const delivery of metadataDeliveries.pending) delivery.release();
    await resetTableEngineForTests();
});
afterAll(async () => await resetPgliteForTests());

describe("YjsTableView completed-result publication (#5692 REQ-004)", { timeout: 60_000 }, () => {
    it("renders the Sales Grid and chart before real metadata authority is delivered", async () => {
        const { projectDoc, grid } = salesProject("sales-result-before-authority");
        const view = render(YjsTableView, { props: { grid, projectDoc } });
        try {
            const delivery = await nextDelivery(0);
            expect(delivery.value.status).toBe("resolved");
            expect(view.container.querySelector('th[data-col="revenue"]')).not.toBeNull();
            expect(view.queryByTestId("grid-readonly-reason")).not.toBeNull();

            await fireEvent.click(view.getByTestId("yjs-table-toggle-chart"));
            await waitFor(() =>
                expect(view.getByTestId("yjs-table-chart").getAttribute("aria-label"))
                    .toMatch(/Bar chart.*revenue.*Jan.*120/)
            );

            delivery.release();
            await waitFor(() => expect(view.queryByTestId("grid-readonly-reason")).toBeNull());
            expect(view.getByTestId("yjs-table-view").getAttribute("data-mutation-incarnation"))
                .not.toContain("unavailable");
        } finally {
            view.unmount();
            projectDoc.destroy();
            for (const pending of metadataDeliveries.pending) pending.release();
            await waitForTableEngineIdle();
        }
    });

    it("cannot publish an old authority after a newer query generation starts", async () => {
        const { projectDoc, grid } = salesProject("stale-sales-result-authority");
        const view = render(YjsTableView, { props: { grid, projectDoc } });
        try {
            const first = await nextDelivery(0);
            expect(view.container.querySelector('th[data-col="revenue"]')).not.toBeNull();

            setGridQuery(grid, "SELECT id, month, revenue FROM sales ORDER BY month DESC ");
            const second = await nextDelivery(1);
            first.release();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(view.queryByTestId("grid-readonly-reason")).not.toBeNull();

            second.release();
            await waitFor(() =>
                expect(view.getByTestId("yjs-table-view").getAttribute("data-mutation-incarnation"))
                    .not.toContain("unavailable")
            );
        } finally {
            view.unmount();
            projectDoc.destroy();
            for (const pending of metadataDeliveries.pending) pending.release();
            await waitForTableEngineIdle();
        }
    });
});
