import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createBlankGrid } from "./crossProjectGridHelpers";
import { createBlockFromItem } from "./nodeKindHelpers";
import { SqlEditorHelper } from "./sqlEditorHelpers";
import { TestHelpers } from "./testHelpers";

export const supplierQuery = (names = ["insert_a", "insert_b"]) =>
    names.map(name => `SELECT id AS id, title AS title FROM ${name}`).join(" UNION ALL ");

export async function prepareInsertPreference(page: Page, info: TestInfo) {
    await TestHelpers.seedProjectAndNavigate(page, info, ["Query anchor", "Source anchor"]);
    for (const name of ["insert_a", "insert_b", "insert_c"]) await createBlankGrid(page, "Same display name", name);
    // Fixture data/schema setup only. Preference and insertion always use controls.
    const ids = await page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const ids: Record<string, string> = {};
        project.ydoc.getMap("yjsTables").forEach((entry: any, id: string) => {
            const name = entry.get("sqlName");
            const schema = entry.get("doc").getText("schema");
            const extra = name === "insert_b"
                ? ", b_only INTEGER NOT NULL DEFAULT 7"
                : name === "insert_a"
                ? ", a_only BOOLEAN NOT NULL DEFAULT false"
                : "";
            schema.delete(0, schema.length);
            schema.insert(
                0,
                `CREATE TABLE ${name} (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '${name}', marker TEXT DEFAULT '${name}-physical'${extra})`,
            );
            ids[name] = id;
        });
        return ids;
    });
    const host = await createBlockFromItem(
        page,
        page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Query anchor" }),
        "Grid",
    );
    await host.getByRole("button", { name: "New Query Grid", exact: true }).click();
    await host.getByTestId("yjs-grid-create-query").click();
    const grid = host.getByTestId("yjs-table-view");
    const gridId = (await grid.getAttribute("data-grid-id"))!;
    await grid.getByTestId("yjs-table-toggle-ui").click();
    await setInsertQuery(page, grid, supplierQuery());
    await expect(grid.getByTestId("grid-insert-resolution")).toContainText("Choose an INSERT destination");
    const state = () => readInsertState(page, gridId);
    expect((await state()).definition).not.toHaveProperty("sourceTableId");
    expect((await state()).definition).not.toHaveProperty("insertTargetTableId");
    return { grid, gridId, ids, state };
}

export async function setInsertQuery(page: Page, grid: Locator, query: string) {
    await new SqlEditorHelper(grid.getByTestId("yjs-table-query-input")).fillAndCommit(page, query);
}

export async function chooseInsertTarget(grid: Locator, id: string) {
    await grid.getByTestId("grid-insert-preference-open").click();
    await grid.getByTestId("grid-insert-preference-select").selectOption(id);
    await grid.getByTestId("grid-insert-preference-apply").click();
    await expect(grid.getByTestId("grid-insert-preference-apply")).toHaveCount(0);
}

export async function readInsertState(page: Page, gridId: string) {
    return page.evaluate(id => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const tables: Record<string, Record<string, unknown>> = {};
        project.ydoc.getMap("yjsTables").forEach((entry: any, tableId: string) =>
            tables[tableId] = entry.get("doc").getMap("data").toJSON()
        );
        return {
            definition: project.ydoc.getMap("yjsGrids").get(id).toJSON(),
            tables,
            undoDepth: (globalThis as any).globalUndoRouter.undoDepth,
        };
    }, gridId);
}

export async function holdInsert(page: Page, targetId: string) {
    await page.evaluate(id => {
        let release!: () => void;
        const promise = new Promise<void>(resolve => release = resolve);
        const gate = { reached: false, consumed: false, release, failure: "" };
        (globalThis as any).__insertGate = gate;
        (globalThis as any).__GRID_INSERT_TEST_CONTROL__ = {
            beforeAcquire: async (target: string) => {
                if (target !== id || gate.consumed) return;
                gate.consumed = true;
                gate.reached = true;
                await promise;
                if (gate.failure) throw new Error(gate.failure);
            },
        };
    }, targetId);
}

export async function startHeldInsert(page: Page, grid: Locator) {
    await grid.getByTestId("yjs-table-add-row").click();
    await expect.poll(() => page.evaluate(() => (globalThis as any).__insertGate.reached)).toBe(true);
    await expect(grid.getByTestId("yjs-table-add-row")).toBeDisabled();
}

export async function releaseInsert(page: Page, failure = "") {
    await page.evaluate(message => {
        const gate = (globalThis as any).__insertGate;
        gate.failure = message;
        gate.release();
    }, failure);
}
