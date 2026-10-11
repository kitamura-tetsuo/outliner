/** @feature GRD-5c1d8e2a */
import type { Page } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord, configureGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import {
    commitWidthsProduction,
    expectFixedWidth,
    readWidthGridRegistry,
    singleGridId,
} from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
const ALL_FIXED = [["id", 120], ["title", 300], ["quantity", 160], ["done", 64]] as const;

// Issue #5457 REQ-007 (AS-002): no fixed-width scenario mounts a Grid inside
// a Layout. This spec places a normally created Grid in a partial-span cell,
// commits widths through the production writer, and proves exact tracks,
// local scrolling, preserved neighbor geometry and spans, and intact data.
async function seedLayoutWithGridSlot(page: Page): Promise<void> {
    await page.evaluate(() => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        const gridSlot = layout.items.addNode("e2e-grid-slot");
        gridSlot.columnSpan = 6;
        gridSlot.componentType = "yjstable";
        const neighbor = layout.items.addNode("e2e-neighbor");
        neighbor.columnSpan = 6;
        neighbor.componentType = "calendar";
    });
}

const storedSpans = (page: Page): Promise<Array<{ id: string; span?: number; }>> =>
    page.evaluate(() => {
        const layout = (globalThis as any).generalStore.currentPage.items.at(0);
        return [...layout.items].map((child: { id: string; columnSpan?: number; }) => ({
            id: child.id,
            span: child.columnSpan,
        }));
    });

test.describe("Grid fixed widths hold inside a partial-span Layout", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await seedLayoutWithGridSlot(page);
        const gridCell = page.getByTestId("layout-cell").nth(0);
        await expect(gridCell).toBeVisible({ timeout: 15000 });
        await gridCell.locator(".component-wrapper").click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const panel = page.getByTestId("yjs-table-create-panel").first();
        await expect(panel).toBeVisible({ timeout: 10000 });
        await panel.getByTestId("yjs-table-name-input").fill("Widths");
        await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
        await panel.getByTestId("yjs-table-sql-name-input").fill("width_layout_orders");
        await panel.getByTestId("yjs-table-create").click();
        await expect(gridCell.getByTestId("yjs-table-view")).toBeVisible({ timeout: 30000 });
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const setupView = page.getByTestId("yjs-table-view").first();
        if (!await setupView.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await setupView.getByTestId("yjs-table-toggle-ui").click();
        }
        await setupView.getByTestId("yjs-table-hidden-done").check();
        // Close the UI editor so the cell returns to its partial span: while
        // open, the Layout temporarily expands the editing grid full width.
        await setupView.getByTestId("yjs-table-toggle-ui").click();
        await expect(setupView).not.toHaveAttribute("data-ui-editor-open", "true", { timeout: 10000 });
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test("mixed then all-fixed widths keep tracks, scrolling and spans", async ({ page }) => {
        const gridCell = page.getByTestId("layout-cell").nth(0);
        const neighborCell = page.getByTestId("layout-cell").nth(1);
        const gridView = gridCell.getByTestId("yjs-table-view");
        const grid = gridView.getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
        const baselineData = (await readGridProjectState(page)).tables[0].data;
        expect((await storedSpans(page)).map((entry) => entry.span)).toEqual([6, 6]);

        // Mixed layout: fixed tracks exact, neighbor beside the grid, page intact.
        await commitWidthsProduction(page, await singleGridId(page), { title: 300, done: 64 });
        await expectFixedWidth(page, 0, "title", 300);
        await expectFixedWidth(page, 0, "done", 64);
        const wideNeighbor = await neighborCell.boundingBox();
        const wideGridCell = await gridCell.boundingBox();
        expect(wideNeighbor).not.toBeNull();
        expect(wideGridCell).not.toBeNull();
        // Side by side in the 6/6 split: the neighbor starts where the grid
        // cell ends instead of stacking or overlapping it.
        expect(wideNeighbor!.x).toBeGreaterThanOrEqual(wideGridCell!.x + wideGridCell!.width - 2);
        expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1))
            .toBe(true);

        // Narrow the container until the table exceeds its placement: fixed
        // tracks hold, the grid scrolls locally, and the neighbor, page and
        // saved spans are preserved.
        await page.setViewportSize({ width: 480, height: 800 });
        await commitWidthsProduction(page, await singleGridId(page), { id: 120, quantity: 160 });
        for (const [column, px] of ALL_FIXED) await expectFixedWidth(page, 0, column, px);
        expect(await grid.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1)).toBe(true);
        await grid.evaluate((el: HTMLElement) => el.scrollTo({ left: 24 }));
        expect(await grid.evaluate((el: HTMLElement) => el.scrollLeft)).toBeGreaterThan(0);
        expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= 481)).toBe(true);
        const narrowNeighbor = await neighborCell.boundingBox();
        expect(narrowNeighbor).not.toBeNull();
        expect(narrowNeighbor!.x + narrowNeighbor!.width).toBeLessThanOrEqual(481);
        expect((await storedSpans(page)).map((entry) => entry.span)).toEqual([6, 6]);

        // Focusing an inline editor inside the Layout keeps every fixed track.
        await grid.locator('td[data-col="title"] button.cell-value').first().click();
        await expect(grid.locator('td[data-col="title"] input.cell-input').first()).toBeVisible({
            timeout: 15000,
        });
        for (const [column, px] of ALL_FIXED) await expectFixedWidth(page, 0, column, px);
        await page.keyboard.press("Escape");

        // Saved state mirrors the production commits; source data is untouched.
        const registry = await readWidthGridRegistry(page);
        expect(registry[0].components["title"]?.["widthPx"]).toBe(300);
        expect(registry[0].components["done"]?.["widthPx"]).toBe(64);
        expect(registry[0].components["id"]?.["widthPx"]).toBe(120);
        expect(registry[0].components["quantity"]?.["widthPx"]).toBe(160);
        expect(registry[0].query).toBe(QUERY);
        const state = await readGridProjectState(page);
        expect(state.tables[0].schema).toBe(SCHEMA);
        expect(state.tables[0].data).toEqual(baselineData);
    });
});
