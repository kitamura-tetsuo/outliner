/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import { addSourceRecord, configureGrid, createBlankGrid } from "../utils/crossProjectGridHelpers";
import { expectFixedWidth, readWidthGridRegistry, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { waitForGridColumns } from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Integral numeric spellings (issue #5458 REQ-002): the Width (px) control
 * validates the numeric value, not its textual syntax, so complete decimal
 * and exponent spellings of an integral width commit while fractional and
 * incomplete spellings reject visibly without writing.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN NOT NULL\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

test.describe("Grid numeric width integral spellings", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
    });

    async function openUiEditor(page: Page) {
        const view = page.getByTestId("yjs-table-view").first();
        if (!await view.getByTestId("yjs-table-width-title").isVisible().catch(() => false)) {
            await view.getByTestId("yjs-table-toggle-ui").click();
        }
        await expect(view.getByTestId("yjs-table-width-title")).toBeVisible({ timeout: 30000 });
        return view;
    }

    test("decimal and exponent spellings commit; fractional and incomplete reject", async ({ page }) => {
        const view = await openUiEditor(page);
        const widthInput = view.getByTestId("yjs-table-width-title");

        await widthInput.fill("180.0");
        await widthInput.press("Enter");
        await expect(widthInput).toHaveValue("180");
        await expectFixedWidth(page, 0, "title", 180);

        const gridId = await singleGridId(page);
        const committed = (await readWidthGridRegistry(page)).find((g) => g.gridId === gridId);
        expect(committed?.components["title"]?.["widthPx"]).toBe(180);

        await widthInput.fill("");
        await widthInput.press("Enter");
        await expect(widthInput).toHaveValue("");

        await widthInput.fill("1.8e2");
        await widthInput.press("Enter");
        await expect(widthInput).toHaveValue("180");
        await expectFixedWidth(page, 0, "title", 180);

        // A genuinely fractional value rejects visibly without writing.
        await widthInput.fill("180.5");
        await widthInput.evaluate((e) => (e as HTMLInputElement).blur());
        await expect(view.getByTestId("yjs-table-width-error-title")).toBeVisible();
        await expectFixedWidth(page, 0, "title", 180);

        // An incomplete exponent typed keystroke-by-keystroke leaves the
        // native control in badInput state: validation failure, no auto reset.
        await widthInput.fill("");
        await widthInput.pressSequentially("1e");
        await widthInput.evaluate((e) => (e as HTMLInputElement).blur());
        await expect(view.getByTestId("yjs-table-width-error-title")).toBeVisible();
        await expectFixedWidth(page, 0, "title", 180);

        // Escape discards the draft and restores the saved display.
        await widthInput.press("Escape");
        await expect(widthInput).toHaveValue("180");

        await page.reload();
        await waitForGridColumns(page);
        await expectFixedWidth(page, 0, "title", 180);
    });
});
