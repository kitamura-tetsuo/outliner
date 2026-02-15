import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ALS-8a1f2c30
 *  Title   : Alias path fallback via lastConfirmedTargetId within 2s
 *  Source  : docs/client-features/als-alias-fallback-lastconfirmed-8a1f2c30.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Case: Fallback via aliasPickerStore.lastConfirmedTargetId is effective within 2 seconds, and the path is displayed in the UI.
 */

test.describe("ALS-8a1f2c30: alias fallback shows path within 2s", () => {
    test("lastConfirmedTargetId fallback renders alias path text", async ({ page }, testInfo) => {
        // Initialize page with specific items (for target and alias)
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "PAGE TITLE",
            "TARGET AAA",
            "ALIAS PLACEHOLDER",
        ]);

        // Go to project page (already navigated in prepare, but explicit)
        // await page.goto(`/${projectName}/${pageName}`);

        // Wait for the target item to be rendered before trying to find its ID
        await expect(page.locator(".outliner-item", { hasText: "TARGET AAA" })).toBeVisible();

        // Stably retrieve target/alias IDs from text content
        const [targetId, aliasId] = await page.evaluate(() => {
            const findIdByExactText = (text: string): string | null => {
                const nodes = Array.from(
                    document.querySelectorAll<HTMLElement>(".outliner-item[data-item-id] .item-text"),
                );
                for (const n of nodes) {
                    const t = (n.innerText || n.textContent || "").trim();
                    if (t === text) {
                        const item = n.closest<HTMLElement>(".outliner-item[data-item-id]");
                        return item?.dataset.itemId ?? null;
                    }
                }
                return null;
            };
            const tId = findIdByExactText("TARGET AAA");
            const aId = findIdByExactText("ALIAS PLACEHOLDER");
            return [tId, aId];
        });
        expect(targetId).toBeTruthy();
        expect(aliasId).toBeTruthy();

        // Set aliasPickerStore's last confirmed information (within 2 seconds)
        await page.evaluate(([itemId, targetId]) => {
            const ap: any = (window as any).aliasPickerStore;
            if (!ap) throw new Error("aliasPickerStore not found");
            ap.lastConfirmedItemId = itemId;
            ap.lastConfirmedTargetId = targetId;
            ap.lastConfirmedAt = Date.now();
            // Slightly modify target item text to trigger re-render and ensure dependency recalculation
            const gs: any = (window as any).generalStore;
            const items = gs?.currentPage?.items as any;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = items.at ? items.at(i) : items[i];
                if (String(it.id) === String(itemId)) {
                    const t = (it.text?.toString?.() ?? "") + " ";
                    it.updateText(t);
                    break;
                }
            }
        }, [aliasId!, targetId!]);

        // First wait for data-alias-target-id to be reflected (ensure derived stores fire)
        await page.waitForSelector(`[data-item-id="${aliasId}"][data-alias-target-id="${targetId}"]`, {
            timeout: 6000,
            state: "attached",
        });

        // Wait until alias path is rendered (fallback within 2 seconds is effective)
        const aliasPath = page.locator(`[data-item-id="${aliasId}"] .alias-path[data-alias-owner-id="${aliasId}"]`);
        await expect(aliasPath).toBeVisible({ timeout: 6000 });

        // Verify the path text contains the target string
        await expect(aliasPath).toContainText("TARGET AAA");
    });
});
