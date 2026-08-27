/** @feature FTR-GRID-UI-EXPANSION
 *  Title   : Temporarily expand Layout Grid to full width while editing its UI definition
 */
import { expect, test } from "@playwright/test";
import { waitForGridColumns } from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function seedLayoutWithTasksTable(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        // Create 2 items
        const child1 = layout.items.addNode("e2e1");
        child1.columnSpan = 5;
        // set directly to yjstable so it initializes as a table
        child1.componentType = "yjstable";

        const child2 = layout.items.addNode("e2e2");
        child2.componentType = "calendar";
        child2.columnSpan = 7;
    });
}

/** Persisted spans and child ids, read straight from the Yjs tree. */
const storedLayout = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
        const layout = (globalThis as any).generalStore.currentPage.items.at(0);
        return [...layout.items].map((child: { id: string; columnSpan?: number; }) => ({
            id: child.id,
            span: child.columnSpan,
        }));
    });

const cells = (page: import("@playwright/test").Page) => page.getByTestId("layout-cell");

test.describe("FTR-GRID-UI-EXPANSION: Temporarily expand Layout Grid to full width while editing its UI definition", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("temporarily expands a grid to full width when UI editor is open", async ({ page }) => {
        await seedLayoutWithTasksTable(page);

        // Wait for children to be rendered
        await expect(cells(page)).toHaveCount(2, { timeout: 15000 });

        // Ensure viewport is wide enough so it doesn't trigger responsive stacking
        await page.setViewportSize({ width: 1280, height: 800 });

        const gridCell = cells(page).nth(0);
        await expect(gridCell).toBeVisible({ timeout: 15000 });

        // Click the component-wrapper inside the layout cell to activate the block
        await gridCell.locator(".component-wrapper").click();
        await page.waitForTimeout(300);

        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        // Wait until grid view is fully visible
        const gridView = gridCell.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 15000 });
        await waitForGridColumns(page);

        const before = await storedLayout(page);
        expect(before.map(entry => entry.span)).toEqual([5, 7]);

        await expect(gridCell).toHaveAttribute("data-column-span", "5", { timeout: 10000 });

        const uiToggleButton = gridView.getByTestId("yjs-table-toggle-ui");
        await expect(uiToggleButton).toBeVisible({ timeout: 15000 });

        // Get bounding box before opening
        const bboxBefore = await gridCell.boundingBox();
        expect(bboxBefore).not.toBeNull();

        // Open UI editor
        await uiToggleButton.click();

        // UI editor is now open, verify data attribute on the grid view
        await expect(gridView).toHaveAttribute("data-ui-editor-open", "true", { timeout: 10000 });

        // Wait a short moment for CSS transition if any
        await page.waitForTimeout(500);

        // Instead of testing CSS `grid-column`, rely on `boundingBox` width since `!important`
        // with `:has` is sometimes tricky to extract via Svelte or Playwright `getComputedStyle`

        const bboxAfter = await gridCell.boundingBox();
        expect(bboxAfter).not.toBeNull();

        // The cell is now expanded
        // Use a wide enough margin just in case padding varies
        expect(bboxAfter!.width).toBeGreaterThan(bboxBefore!.width + 100);

        // The persisted layout span must not be changed
        const middle = await storedLayout(page);
        expect(middle.map(entry => entry.span)).toEqual([5, 7]);

        // Also it should maintain its 5/12 string representation on the slider/value view
        await expect(gridCell.getByTestId("layout-span-value")).toContainText("5/12");

        // Close UI editor
        await uiToggleButton.click();
        await expect(gridView).not.toHaveAttribute("data-ui-editor-open", "true", { timeout: 10000 });

        await page.waitForTimeout(500);

        const bboxFinal = await gridCell.boundingBox();
        expect(bboxFinal).not.toBeNull();

        // Should go back to original width
        expect(Math.abs(bboxFinal!.width - bboxBefore!.width)).toBeLessThan(5);

        const after = await storedLayout(page);
        expect(after.map(entry => entry.span)).toEqual([5, 7]);
    });
});
