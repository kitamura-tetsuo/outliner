import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/**
 * The item context menu used to carry "Change to Database / Calendar / Layout"
 * actions. Node kinds are immutable now (#5015): a node is created as its kind,
 * so the menu is kind-aware and offers no conversion at all.
 */
test.describe("Item context menu offers no node-kind conversion", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const seedLines = ["Test Item"];
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, seedLines);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, seedLines);
    });

    test("shows the item actions without any Change to ... entry", async ({ page }) => {
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        await item.locator(".item-content").click({ button: "right" });

        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible();

        // The actions that remain are the ones valid for a Text node.
        await expect(contextMenu.locator("button", { hasText: "Add new item below" })).toBeVisible();
        await expect(contextMenu.locator("button", { hasText: "Delete item" })).toBeVisible();

        for (const removed of ["Change to Database", "Change to Calendar", "Change to Text", "Change to Layout"]) {
            await expect(contextMenu.locator("button", { hasText: removed })).toHaveCount(0);
        }

        // "Remove layout (keep blocks)" is a Layout-only structural action, so
        // it is absent on a Text node.
        await expect(contextMenu.locator("button", { hasText: "Remove layout" })).toHaveCount(0);
    });
});
