/** @feature FTR-5514c0de */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test(
    "embedded and standalone Grids navigate by the Table named by their SELECT",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Grid host"]);
        await createBlankGrid(page, "Table B", "table_b");
        await createBlankGrid(page, "Table A", "table_a");

        const initialAView = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-sql-name").filter({ hasText: /^table_a$/ }),
        });
        const gridId = await initialAView.getAttribute("data-grid-id");
        expect(gridId).toBeTruthy();
        const tableAView = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        const savedQuery = () =>
            page.evaluate(
                id =>
                    (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc.getMap("yjsGrids").get(id).get(
                        "query",
                    ),
                gridId,
            );

        const state = await readGridProjectState(page);
        const tableB = state.tables.find(table => table.sqlName === "table_b")!;
        await tableAView.getByTestId("yjs-table-toggle-ui").click();
        await new SqlEditorHelper(tableAView.getByTestId("yjs-table-query-input")).fillAndCommit(
            page,
            `SELECT * FROM ${tableB.sqlName}`,
        );
        await expect.poll(savedQuery).toBe(`SELECT * FROM ${tableB.sqlName}`);
        const embedded = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        await expect(embedded.getByTestId("yjs-table-name")).toHaveText("Table A");
        await expect(embedded.getByTestId("yjs-table-sql-name")).toHaveText("table_b");
        const embeddedAction = embedded.getByTestId("yjs-grid-source-table-link");
        await embeddedAction.focus();
        await expect(embeddedAction).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`/-/tables/${tableB.id}$`), { timeout: 30000 });

        await page.goto(`/${encodeURIComponent(projectName)}/-/grids/${gridId}`);
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone.getByTestId("yjs-table-name")).toHaveText("Table A", { timeout: 30000 });
        await expect(standalone.getByTestId("yjs-table-sql-name")).toHaveText("table_b");
        await standalone.getByTestId("yjs-table-toggle-ui").click();
        const editor = new SqlEditorHelper(standalone.getByTestId("yjs-table-query-input"));
        await editor.fillAndCommit(page, "SELECT 1 AS value");
        await expect.poll(savedQuery).toBe("SELECT 1 AS value");
        await expect(standalone.getByTestId("grid-query-dependencies")).toHaveText("No project Table dependencies");
        await expect(standalone.getByTestId("yjs-grid-source-table-link")).toHaveCount(0);
        await expect(standalone.getByTestId("yjs-table-name")).toHaveText("Table A");
        await editor.fillAndCommit(page, "SELECT * FROM table_b");
        await expect.poll(savedQuery).toBe("SELECT * FROM table_b");
        const standaloneAction = standalone.getByTestId("yjs-grid-source-table-link");
        await standaloneAction.focus();
        await expect(standaloneAction).toBeFocused();
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
