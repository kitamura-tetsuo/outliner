/** @feature FTR-5514c0de */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test(
    "embedded and standalone Grids navigate by the Table named by their SELECT",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Grid host"]);
        await createBlankGrid(page, "Table B", "table_b");
        await createBlankGrid(page, "Table A", "table_a");

        const tableAView = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-sql-name").filter({ hasText: /^table_a$/ }),
        });
        const gridId = await tableAView.getAttribute("data-grid-id");
        expect(gridId).toBeTruthy();

        const state = await readGridProjectState(page);
        const tableB = state.tables.find(table => table.sqlName === "table_b")!;
        await page.evaluate(({ gridId, tableBSql }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.getMap("yjsGrids").get(gridId).set("query", `SELECT * FROM ${tableBSql}`);
        }, { gridId, tableBSql: tableB.sqlName });

        const embedded = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").filter({ hasText: "Table B" }),
        });
        await expect(embedded.getByTestId("yjs-table-sql-name")).toHaveText("table_b");
        const embeddedAction = embedded.getByTestId("yjs-grid-source-table-link");
        await embeddedAction.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`/-/tables/${tableB.id}$`), { timeout: 30000 });

        await page.goto(`/${encodeURIComponent(projectName)}/-/grids/${gridId}`);
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone.getByTestId("yjs-table-name")).toHaveText("Table B", { timeout: 30000 });
        await expect(standalone.getByTestId("yjs-table-sql-name")).toHaveText("table_b");
        const standaloneAction = standalone.getByTestId("yjs-grid-source-table-link");
        await standaloneAction.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("table-entity-view")).toHaveAttribute("data-table-id", tableB.id, {
            timeout: 30000,
        });

        const stored = await page.evaluate((id) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const entry = project.ydoc.getMap("yjsGrids").get(id);
            return { sourceTableId: entry.get("sourceTableId"), query: entry.get("query") };
        }, gridId);
        expect(stored).toEqual({ sourceTableId: undefined, query: "SELECT * FROM table_b" });
    },
);
