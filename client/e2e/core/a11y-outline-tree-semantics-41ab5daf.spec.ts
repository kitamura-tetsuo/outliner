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
        await expect(page.locator(".tree-items-role-wrapper")).toHaveAttribute("role", "tree");

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

    test("item text is not truncated in accessible name", async ({ page }, testInfo) => {
        // Seed an item with text longer than 50 characters
        const longText = "Move between items with the arrow keys; the cursor keeps its horizontal position.";
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [longText]);
        await TestHelpers.waitForOutlinerItems(page, 2);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        // Assert that the item element does not have an aria-label attribute (so the accessible name comes from the full text)
        await expect(firstItem).not.toHaveAttribute("aria-label");

        // Ensure the element actually contains the full text
        await expect(firstItem).toContainText(longText);
    });

    test("zero-count comment button is hidden from accessibility tree on desktop", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Item with no comments",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 1);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        const commentButton = firstItem.locator(".comment-button");

        // Assert that the button is in the DOM but not visible
        await expect(commentButton).toBeAttached();

        // The default view is desktop (>768px), so visibility: hidden should apply
        await expect(commentButton).toBeHidden();

        // Assert that the element is hidden due to visibility (in Playwright toBeHidden covers visibility: hidden)
        // Let's also check the actual computed style just to be sure it's visibility: hidden and not display: none
        const display = await commentButton.evaluate(el => getComputedStyle(el).display);
        const visibility = await commentButton.evaluate(el => getComputedStyle(el).visibility);

        expect(display).not.toBe("none"); // Still reserves space
        expect(visibility).toBe("hidden"); // But hidden from a11y tree
    });
});
