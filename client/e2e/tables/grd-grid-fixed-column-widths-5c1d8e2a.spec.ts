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
import { commitWidthsProduction, placementColumnWidths, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
const LONG_WORD = "x".repeat(120);

// Issue #5457 (AS-001/AS-002): fixed columns render at their exact CSS-pixel
// widths while auto columns absorb spare space; content and editors cannot
// move a pinned track. Widths are committed through the production writer
// (`setGridColumnWidth` on the owning Grid's handles; writer contract in
// `gridColumnWidth.test.ts`), so the full production path — writer, Yjs
// observation, mirror, render, browser layout — is what is measured here.
// Only pixel geometry asserts, never CSS strings.
const columnWidths = (page: Page, column: string): Promise<number[]> => placementColumnWidths(page, 0, column);

test.describe("Grid fixed column widths render at exact pixel widths", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const [firstRecordId] = Object.keys((await readGridProjectState(page)).tables[0].data);
        await setCellValue(page, 0, firstRecordId, "title", LONG_WORD);
        // configureGrid hides `done` for its own setup; this spec measures it.
        const setupView = page.getByTestId("yjs-table-view").first();
        if (!await setupView.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await setupView.getByTestId("yjs-table-toggle-ui").click();
        }
        await setupView.getByTestId("yjs-table-hidden-done").check();
        await commitWidthsProduction(page, await singleGridId(page), { title: 180, done: 48 });
    });

    test("180 means 180 and only auto columns absorb spare room", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });

        for (const w of await columnWidths(page, "title")) expect(w).toBeGreaterThanOrEqual(179);
        for (const w of await columnWidths(page, "title")) expect(w).toBeLessThanOrEqual(181);
        for (const w of await columnWidths(page, "done")) {
            expect(w).toBeGreaterThanOrEqual(47);
            expect(w).toBeLessThanOrEqual(49);
        }

        // The project page centers content in a `max-w-7xl` shell, so viewports
        // at or above 1280px no longer widen the Grid's container. Resize
        // within the responsive range instead, where spare container space
        // genuinely grows.
        await page.setViewportSize({ width: 1000, height: 800 });
        const autoBefore = await grid.locator('th[data-col="quantity"]').boundingBox();
        await page.setViewportSize({ width: 1280, height: 800 });
        for (const w of await columnWidths(page, "title")) {
            expect(w).toBeGreaterThanOrEqual(179);
            expect(w).toBeLessThanOrEqual(181);
        }
        const autoAfter = await grid.locator('th[data-col="quantity"]').boundingBox();
        expect(autoAfter!.width).toBeGreaterThan(autoBefore!.width);
    });

    test("narrow containers keep pins without widening the page, and editing cannot override width", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });

        // Mixed layout in a narrow container: automatic columns shrink while
        // fixed tracks hold their exact widths, and the page never widens.
        await page.setViewportSize({ width: 480, height: 800 });
        for (const w of await columnWidths(page, "title")) {
            expect(w).toBeGreaterThanOrEqual(179);
            expect(w).toBeLessThanOrEqual(181);
        }
        for (const w of await columnWidths(page, "done")) {
            expect(w).toBeGreaterThanOrEqual(47);
            expect(w).toBeLessThanOrEqual(49);
        }
        const mixedOverflow = await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= 481);
        expect(mixedOverflow).toBe(true);

        // Focusing the native inline editor must not widen the fixed column.
        await grid.locator('td[data-col="title"] button.cell-value').first().click();
        await expect(grid.locator('td[data-col="title"] input.cell-input').first()).toBeVisible({
            timeout: 15000,
        });
        for (const w of await columnWidths(page, "title")) {
            expect(w).toBeGreaterThanOrEqual(179);
            expect(w).toBeLessThanOrEqual(181);
        }
        await page.keyboard.press("Escape");

        // All data columns fixed: the table is wider than its container, so
        // surplus stays outside the tracks and the grid scrolls locally.
        const view = page.getByTestId("yjs-table-view").first();
        if (!await view.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await view.getByTestId("yjs-table-toggle-ui").click();
        }
        // The production writer creates absent component entries itself, so
        // `id` needs no label-input setup before its width is committed.
        await commitWidthsProduction(page, await singleGridId(page), { id: 120, quantity: 96 });
        // Wait for the newly committed tracks to render before asserting.
        await expect.poll(() => columnWidths(page, "id").then((w) => w[0]), { timeout: 30000 })
            .toBeLessThanOrEqual(121);
        expect((await columnWidths(page, "id"))[0]).toBeGreaterThanOrEqual(119);
        for (const w of await columnWidths(page, "title")) {
            expect(w).toBeGreaterThanOrEqual(179);
            expect(w).toBeLessThanOrEqual(181);
        }
        const scrolls = await grid.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1);
        expect(scrolls).toBe(true);
        const pageOverflow = await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= 481);
        expect(pageOverflow).toBe(true);
    });
});
