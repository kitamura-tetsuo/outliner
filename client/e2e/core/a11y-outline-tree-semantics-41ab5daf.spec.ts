import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-41ab5daf
 *  Title   : Accessible outline tree semantics
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Accessible outline tree semantics", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Parent item",
            "Child item",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 3);
    });

    test("outline container and items expose tree/treeitem ARIA roles", async ({ page }) => {
        await expect(page.locator(".tree-container")).toHaveAttribute("role", "tree");

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await expect(firstItem).toHaveAttribute("role", "treeitem");
        await expect(firstItem).toHaveAttribute("aria-level", "1");
        await expect(firstItem).toHaveAttribute("aria-selected", /true|false/);
    });

    test("collapsible item exposes aria-expanded reflecting collapsed state", async ({ page }) => {
        const parentId = await TestHelpers.getItemIdByIndex(page, 1);
        const childId = await TestHelpers.getItemIdByIndex(page, 2);
        expect(parentId).not.toBeNull();
        expect(childId).not.toBeNull();

        // Indent the second item under the first so the first item has a child.
        const child = page.locator(`.outliner-item[data-item-id="${childId}"]`);
        await child.locator(".item-content").click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(200);

        const parentItem = page.locator(`.outliner-item[data-item-id="${parentId}"]`);
        await expect(parentItem).toHaveAttribute("aria-expanded", "true");

        await parentItem.locator("button.collapse-btn").click();

        await expect(parentItem).toHaveAttribute("aria-expanded", "false");
    });

    test("keyboard accessibility help documents indent/outdent and move shortcuts", async ({ page }) => {
        const details = page.locator("details.a11y-help");
        await expect(details.locator("summary")).toBeVisible();
        await expect(details).toContainText("Tab");
        await expect(details).toContainText("Alt+");
    });
});
