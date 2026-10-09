/** @feature FTR-5514c0de */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test(
    "embedded and standalone Grids navigate by sourceTableId when SELECT names another Table",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Grid host"]);
        await createBlankGrid(page, "Table B", "table_b");
        await createBlankGrid(page, "Table A", "table_a");

        const state = await readGridProjectState(page);
        const tableA = state.tables.find(table => table.sqlName === "table_a")!;
        const tableB = state.tables.find(table => table.sqlName === "table_b")!;
        const gridId = await page.evaluate(({ tableAId, tableBSql }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const grids = project.ydoc.getMap("yjsGrids");
            let selected: any;
            grids.forEach((entry: any, id: string) => {
                if (entry.get("sourceTableId") === tableAId) selected = { entry, id };
            });
            selected.entry.set("query", `SELECT * FROM ${tableBSql}`);
            return selected.id as string;
        }, { tableAId: tableA.id, tableBSql: tableB.sqlName });

        const embedded = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").filter({ hasText: "Table A" }),
        });
        await expect(embedded.getByTestId("yjs-table-sql-name")).toHaveText("table_a");
        const embeddedAction = embedded.getByTestId("yjs-grid-source-table-link");
        await embeddedAction.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("table-entity-view")).toHaveAttribute("data-table-id", tableA.id, {
            timeout: 30000,
        });

        await page.goto(`/${encodeURIComponent(projectName)}/-/grids/${gridId}`);
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone.getByTestId("yjs-table-name")).toHaveText("Table A", { timeout: 30000 });
        await expect(standalone.getByTestId("yjs-table-sql-name")).toHaveText("table_a");
        const standaloneAction = standalone.getByTestId("yjs-grid-source-table-link");
        await standaloneAction.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("table-entity-view")).toHaveAttribute("data-table-id", tableA.id, {
            timeout: 30000,
        });

        const stored = await page.evaluate((id) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const entry = project.ydoc.getMap("yjsGrids").get(id);
            return { sourceTableId: entry.get("sourceTableId"), query: entry.get("query") };
        }, gridId);
        expect(stored).toEqual({ sourceTableId: tableA.id, query: "SELECT * FROM table_b" });
    },
);
