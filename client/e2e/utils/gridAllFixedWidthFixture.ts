import { expect, type Page, type TestInfo } from "@playwright/test";
import { configureGrid, createBlankGrid } from "./crossProjectGridHelpers";
import { commitWidthsProduction, singleGridId } from "./gridWidthHelpers";
import { TestHelpers } from "./testHelpers";

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
export const ALL_FIXED_WIDTHS = { id: 64, title: 180, done: 48, quantity: 96 };

/** Create and configure the shared fixed-width fixture through supported paths. */
export async function prepareAllFixedWidthGrid(page: Page, testInfo: TestInfo): Promise<void> {
    testInfo.setTimeout(180000);
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
    await createBlankGrid(page, "Widths", "width_orders");
    await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
    const setupView = page.getByTestId("yjs-table-view").first();
    if (!await setupView.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
        await setupView.getByTestId("yjs-table-toggle-ui").click();
    }
    await setupView.getByTestId("yjs-table-hidden-done").check();
    await commitWidthsProduction(page, await singleGridId(page), { ...ALL_FIXED_WIDTHS });
    const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
    await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
}
