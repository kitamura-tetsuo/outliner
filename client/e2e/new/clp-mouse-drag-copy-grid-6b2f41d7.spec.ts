/** @feature CLP-4584c0de */
import { expect, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("mouse drag clipboard with component blocks", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha item", "Block host", "Omega"]);
    });

    /** Resolve a seeded item's id from its text so every later step can address it by data-item-id. */
    async function itemIdByText(page: Page, text: string): Promise<string> {
        const item = page.locator(".outliner-item[data-item-id]").filter({ hasText: text }).first();
        await expect(item).toBeVisible();
        const id = await item.getAttribute("data-item-id");
        expect(id).toBeTruthy();
        return id!;
    }

    test("a mouse drag across a Grid host copies the block, not just its title", async ({ page }) => {
        const sourceId = await itemIdByText(page, "Alpha item");
        const seededHostId = await itemIdByText(page, "Block host");
        await page.locator(`.outliner-item[data-item-id="${seededHostId}"] .item-content`).click();
        const addDatabase = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await addDatabase.click();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 30000 });

        // The toolbar may host the new Grid on its own item, so read the host id
        // back from the rendered view instead of assuming a position.
        const gridHostId = await page.getByTestId("yjs-table-view").first().locator(
            "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' outliner-item ') and @data-item-id][1]",
        ).getAttribute("data-item-id");
        expect(gridHostId).toBeTruthy();

        const source = page.locator(`.outliner-item[data-item-id="${sourceId}"] .item-text`);
        // A Grid host owns no outline text and so renders no `.item-text`
        // (#5015). Its `.item-content` is the thin strip where that text used
        // to sit, above the rendered table — which is where a drag reaching
        // "into the block's row" now ends.
        const target = page.locator(`.outliner-item[data-item-id="${gridHostId}"] .item-content`);
        const sourceBox = await source.boundingBox();
        const targetBox = await target.boundingBox();
        expect(sourceBox).not.toBeNull();
        expect(targetBox).not.toBeNull();

        // Drag from inside the first item's text into the middle of the Grid
        // host's row: neither end lands on an item boundary, which is what a
        // real mouse selection looks like. The horizontal midpoint keeps the
        // release clear of the comment button at the strip's left edge.
        await page.mouse.move(sourceBox!.x + 25, sourceBox!.y + sourceBox!.height / 2);
        await page.mouse.down();
        await page.mouse.move(sourceBox!.x + 45, sourceBox!.y + sourceBox!.height / 2, { steps: 5 });
        await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, {
            steps: 10,
        });
        await page.mouse.up();
        await page.waitForTimeout(500);

        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
            .toContain("title\tstatus\tpriority");

        // The structured payload is what carries the Grid binding; a plain text
        // copy would still contain the host title and hide the regression.
        const componentTypes = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const encoded = (window as unknown as { lastCopiedStructuredItems?: string; })
                .lastCopiedStructuredItems;
            if (!encoded) return [];
            return (JSON.parse(encoded) as { items: Array<{ componentType?: string; }>; }).items
                .map(item => item.componentType);
        });
        expect(componentTypes).toContain("yjstable");

        // Paste into a fresh item so no existing text merges with the payload.
        await page.locator(`.outliner-item[data-item-id="${sourceId}"] .item-content`).click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        const sqlNames = await page.locator("[data-testid='yjs-table-sql-name']").allTextContents();
        expect(sqlNames[1]).toBe(sqlNames[0]);
    });
});
