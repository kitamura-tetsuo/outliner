/** @feature CLP-4584c0de */
import { type Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
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
        // The view shell mounts before the async query result is available.
        // Wait for a rendered header so the outward clipboard flavor is the
        // Grid result rather than its temporary display-name fallback.
        await expect(page.getByTestId("yjs-table-grid").first().locator("thead th").first())
            .toBeVisible({ timeout: 30000 });

        const source = page.locator(`.outliner-item[data-item-id="${sourceId}"] .item-text`);
        // A Grid is an atomic visual node with no outline text (#5015). End the
        // gesture in its rendered view, rather than depending on the absent
        // `.item-text` or the empty text-row strip above the component.
        const target = page.getByTestId("yjs-table-view").first();
        const sourceBox = await source.boundingBox();
        const targetBox = await target.boundingBox();
        expect(sourceBox).not.toBeNull();
        expect(targetBox).not.toBeNull();

        // Drag from inside Alpha's text into the visible body of the Grid. Both
        // coordinates are interior points, matching a real cross-node mouse
        // selection rather than relying on item boundaries.
        await page.mouse.move(sourceBox!.x + 25, sourceBox!.y + sourceBox!.height / 2);
        await page.mouse.down();
        await page.mouse.move(sourceBox!.x + 45, sourceBox!.y + sourceBox!.height / 2, { steps: 5 });
        await page.mouse.move(targetBox!.x + targetBox!.width / 3, targetBox!.y + targetBox!.height / 2, {
            steps: 10,
        });
        await page.mouse.up();

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
        const items = page.locator(".outliner-item[data-item-id]");
        const itemCountBeforePaste = await items.count();
        await page.keyboard.press("Enter");
        await expect(items).toHaveCount(itemCountBeforePaste + 1);
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        const sqlNames = await page.locator("[data-testid='yjs-table-sql-name']").allTextContents();
        expect(sqlNames[1]).toBe(sqlNames[0]);
    });
});
