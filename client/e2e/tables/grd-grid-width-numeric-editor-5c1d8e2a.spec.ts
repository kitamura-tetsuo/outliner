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
 * Numeric width editing (issue #5458): the UI Definition editor's Width (px)
 * control commits through the shared width writer, renders exact geometry,
 * isolates Undo steps, and survives reload. Widths always originate from real
 * UI gestures and are read back from saved state plus measured CSS pixels.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN NOT NULL\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

test.describe("Grid numeric width editor", () => {
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

    test("numeric entry commits saved width, geometry and reload persistence", async ({ page }) => {
        const view = await openUiEditor(page);
        const widthInput = view.getByTestId("yjs-table-width-title");

        // Blank control visibly identified as auto before any override.
        await expect(widthInput).toHaveValue("");
        await expect(view.getByText("auto", { exact: true }).first()).toBeVisible();

        await widthInput.fill("180");
        await widthInput.press("Enter");
        await expect(widthInput).toHaveValue("180");
        await expectFixedWidth(page, 0, "title", 180);

        // Saved state carries the override on the exact result name.
        const gridId = await singleGridId(page);
        const registry = await readWidthGridRegistry(page);
        const entry = registry.find((g) => g.gridId === gridId);
        expect(entry?.components["title"]?.["widthPx"]).toBe(180);

        await page.reload();
        await waitForGridColumns(page);
        await expectFixedWidth(page, 0, "title", 180);
        const reopened = await openUiEditor(page);
        await expect(reopened.getByTestId("yjs-table-width-title")).toHaveValue("180");
    });

    test("invalid drafts fail visibly without writing; boundaries commit", async ({ page }) => {
        const view = await openUiEditor(page);
        const widthInput = view.getByTestId("yjs-table-width-title");
        await widthInput.fill("180");
        await widthInput.press("Enter");
        await expectFixedWidth(page, 0, "title", 180);

        await widthInput.fill("31");
        await widthInput.evaluate((e) => (e as HTMLInputElement).blur());
        await expect(view.getByTestId("yjs-table-width-error-title")).toBeVisible();
        await expectFixedWidth(page, 0, "title", 180);

        // Escape discards the draft and restores the saved display.
        await widthInput.press("Escape");
        await expect(widthInput).toHaveValue("180");

        await widthInput.fill("4096");
        await widthInput.press("Enter");
        await expectFixedWidth(page, 0, "title", 4096);
        await widthInput.fill("32");
        await widthInput.press("Enter");
        await expectFixedWidth(page, 0, "title", 32);
    });

    test("rapid commits stay separate Undo steps with Redo", async ({ page }) => {
        const view = await openUiEditor(page);
        const widthInput = view.getByTestId("yjs-table-width-title");

        for (const px of ["180", "220", "260"]) {
            await widthInput.fill(px);
            await widthInput.press("Enter");
        }
        await expect(widthInput).toHaveValue("260");

        const undoBtn = page.getByTestId("toolbar-undo");
        await expect(undoBtn).toBeEnabled({ timeout: 15000 });
        await undoBtn.click();
        await expect(widthInput).toHaveValue("220");
        await undoBtn.click();
        await expect(widthInput).toHaveValue("180");
        await expectFixedWidth(page, 0, "title", 180);

        await page.getByTestId("toolbar-redo").click();
        await expect(widthInput).toHaveValue("220");
    });
});
