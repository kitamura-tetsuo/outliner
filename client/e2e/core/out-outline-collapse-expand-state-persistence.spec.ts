import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/** @feature OUT-COLLAPSE-PERSIST
 *  Title   : Outline collapse/expand state persistence
 *  Source  : docs/client-features.yaml
 */

test.describe("Outline collapse/expand state persistence", () => {
    test("a collapsed item is still collapsed after a reload", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Parent item",
            "Child item",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 3);

        const parentId = await TestHelpers.getItemIdByIndex(page, 1);
        const childId = await TestHelpers.getItemIdByIndex(page, 2);
        expect(parentId).not.toBeNull();
        expect(childId).not.toBeNull();

        // Indent the second item under the first so the first item is collapsible.
        const child = page.locator(`.outliner-item[data-item-id="${childId}"]`);
        await child.locator(".item-content").click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();
        await page.keyboard.press("Tab");

        const parentItem = page.locator(`.outliner-item[data-item-id="${parentId}"]`);
        await expect(parentItem).toHaveAttribute("aria-expanded", "true");

        // Forced: the dev-only debug button is a fixed overlay that can sit over the row.
        await parentItem.locator("button.collapse-btn").click({ force: true });
        await expect(parentItem).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator(`.outliner-item[data-item-id="${childId}"]`)).toHaveCount(0);

        // The collapsed id is written to local storage, keyed by page.
        const storedIds = await page.evaluate(() => {
            const raw = localStorage.getItem("user-preferences");
            if (!raw) return [];
            const parsed = JSON.parse(raw) as { collapsedItems?: Record<string, string[]>; };
            return Object.values(parsed.collapsedItems ?? {}).flat();
        });
        expect(storedIds).toContain(parentId);

        await page.reload();
        await TestHelpers.waitForOutlinerItems(page, 2);

        const parentAfterReload = page.locator(`.outliner-item[data-item-id="${parentId}"]`);
        await expect(parentAfterReload).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator(`.outliner-item[data-item-id="${childId}"]`)).toHaveCount(0);
    });
});
