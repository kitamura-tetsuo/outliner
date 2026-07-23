import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Item Component Type Selector Test", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const seedLines = ["Test Item"];
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, seedLines);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, seedLines);
    });

    test("Component type can be changed from the context menu", async ({ page }) => {
        // Find the first item (not title)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        // Right click the item to open context menu
        await item.click({ button: "right" });

        // The context menu should be visible
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible();

        // Click the toggle type button
        const toggleBtn = contextMenu.locator("button", { hasText: "Change to Database" });
        await toggleBtn.click();

        // Context menu should disappear
        await expect(contextMenu).not.toBeVisible();
    });
});
