/** @feature GRD-5c1d8e2a */
import type { Page } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
    setCellValue,
} from "../utils/crossProjectGridHelpers";
import { commitWidthsProduction, expectFixedWidth, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
const READONLY_QUERY = "SELECT id, title AS subject, done AS flag FROM orders";

// Issue #5457 REQ-007 (AS-002/AS-003): fixed widths must preserve the
// result's cell-component choice and SQL-derived write eligibility, and
// supported edits must address the exact source record and column.
async function setQuery(page: Page, query: string) {
    const view = page.getByTestId("yjs-table-view").first();
    if (!await view.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
        await view.getByTestId("yjs-table-toggle-ui").click();
    }
    await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(page, query);
}

test.describe("Grid fixed widths preserve cell components and write targets", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const setupView = page.getByTestId("yjs-table-view").first();
        if (!await setupView.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await setupView.getByTestId("yjs-table-toggle-ui").click();
        }
        await setupView.getByTestId("yjs-table-hidden-done").check();
        await commitWidthsProduction(page, await singleGridId(page), { title: 180, done: 64 });
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
    });

    test("supported checkbox and inline edits hit the exact source cells", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        // Reorder and duplicate a display label: widths and edits still
        // resolve by exact result-column name.
        await grid.locator('th[data-col="title"]').press("Alt+ArrowRight");
        const view = page.getByTestId("yjs-table-view").first();
        const quantityLabel = view.getByTestId("yjs-table-label-quantity");
        await quantityLabel.fill("Order title");
        await quantityLabel.evaluate((e) => e.blur());
        await expect(grid.locator('th[data-col="quantity"]')).toHaveText("Order title");
        await expectFixedWidth(page, 0, "title", 180);
        await expectFixedWidth(page, 0, "done", 64);

        const before = (await readGridProjectState(page)).tables[0].data;
        const [firstId, secondId] = Object.keys(before);
        expect(
            await grid.locator(`td[data-record-id="${firstId}"][data-col="done"] input[type="checkbox"]`).isChecked(),
        )
            .toBe(false);

        await grid.locator(`td[data-record-id="${firstId}"][data-col="done"] input[type="checkbox"]`).click();
        await expect(
            grid.locator(`td[data-record-id="${firstId}"][data-col="done"] input[type="checkbox"]`),
        ).toBeChecked({ timeout: 15000 });
        await setCellValue(page, 0, secondId, "title", "Edited title");

        // Geometry survives committed edits and the requery they trigger.
        await expectFixedWidth(page, 0, "title", 180);
        await expectFixedWidth(page, 0, "done", 64);
        const after = (await readGridProjectState(page)).tables[0].data;
        expect(after[firstId]).toMatchObject({ done: true, title: before[firstId]["title"] });
        expect(after[firstId]["quantity"]).toEqual(before[firstId]["quantity"]);
        expect(after[secondId]).toMatchObject({ title: "Edited title", done: before[secondId]["done"] });
        expect(after[secondId]["quantity"]).toEqual(before[secondId]["quantity"]);
    });

    test("fixed-width read-only aliases keep their components and reject writes", async ({ page }) => {
        await setQuery(page, READONLY_QUERY);
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="subject"]')).toBeVisible({ timeout: 30000 });
        await commitWidthsProduction(page, await singleGridId(page), { subject: 180, flag: 64 });
        await expectFixedWidth(page, 0, "subject", 180);
        await expectFixedWidth(page, 0, "flag", 64);

        // Component choice is preserved: text button plus disabled checkbox.
        const before = (await readGridProjectState(page)).tables[0].data;
        const [firstId] = Object.keys(before);
        const subjectCell = grid.locator(`td[data-record-id="${firstId}"][data-col="subject"]`);
        await expect(subjectCell.locator("button.cell-value")).toHaveAttribute("aria-disabled", "true");
        const flagBox = grid.locator(`td[data-record-id="${firstId}"][data-col="flag"] input[type="checkbox"]`);
        await expect(flagBox).toBeDisabled();

        // Attempted edits change nothing: no editor opens and source data is
        // byte-identical, while fixed geometry holds throughout.
        await subjectCell.locator("button.cell-value").click();
        expect(await subjectCell.locator("input.cell-input").count()).toBe(0);
        await flagBox.click({ force: true });
        await expectFixedWidth(page, 0, "subject", 180);
        await expectFixedWidth(page, 0, "flag", 64);
        expect((await readGridProjectState(page)).tables[0].data).toEqual(before);
    });
});
