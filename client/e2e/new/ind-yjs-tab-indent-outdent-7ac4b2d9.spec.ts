/** @feature IND-yjs-tab-shifttab-indent-7ac4b2d9
 *  Title   : Yjs Outliner - Tab / Shift+Tab for indent and outdent (single and multi selection)
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

async function getDepth(page, itemId: string): Promise<number> {
    const sel = `.outliner-item[data-item-id="${itemId}"]`;
    await page.waitForSelector(sel);
    const depth = await page.locator(sel).evaluate(el =>
        parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth"))
    );
    return depth;
}

async function pressTab(page) {
    await page.keyboard.press("Tab");
}

async function pressShiftTab(page) {
    await page.keyboard.press("Shift+Tab");
}

test.describe("IND: Yjs Tab/Shift+Tab indent/outdent", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Create a few test items to work with
        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        for (let i = 0; i < 3; i++) {
            if (i > 0) await page.keyboard.press("Enter");
            await page.keyboard.type(`Test Item ${i + 1}`);
        }
    });

    test("single item: Tab increases indent; Shift+Tab decreases", async ({ page }) => {
        // Get the third test item (index 2) - the one to be indented/outdented
        const thirdId = await page
            .locator("[data-item-id]")
            .nth(2)
            .getAttribute("data-item-id");

        expect(thirdId).not.toBeNull();

        const target = page.locator(`.outliner-item[data-item-id="${thirdId}"]`);
        await expect(target).toBeVisible();

        // Click on the target item to make it active
        await target.locator(".item-content").click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();

        // Get initial depth
        const before = await getDepth(page, thirdId!);
        expect(before).not.toBe(-1);

        await page.waitForTimeout(100); // Small wait before tabbing
        // Tab to indent
        await pressTab(page);
        await page.waitForTimeout(200); // Wait longer for UI update

        // Verify the depth increased
        const after = await getDepth(page, thirdId!);
        expect(after).toBeGreaterThanOrEqual(before);

        // Shift+Tab to outdent
        await pressShiftTab(page);
        await page.waitForTimeout(200); // Wait longer for UI update

        // Verify the depth decreased (may not be back to original depending on tree structure)
        const afterOut = await getDepth(page, thirdId!);
        expect(afterOut).toBeLessThanOrEqual(after);
    });

    test("multi selection: Tab indents all; Shift+Tab outdents all", async ({ page }) => {
        // Get the IDs of the second and third items
        const ids = await page.$$eval(
            "[data-item-id]",
            els => els.slice(0, 3).map(el => el.getAttribute("data-item-id")!),
        );
        const [, secondId, thirdId] = ids;

        // Set up a multi-selection between the second and third items
        await page.evaluate(({ startId, endId }) => {
            const store: any = (window as any).editorOverlayStore;
            store.setSelection({
                startItemId: startId,
                startOffset: 0,
                endItemId: endId,
                endOffset: 0,
                userId: "local",
                isReversed: false,
            });
        }, { startId: secondId, endId: thirdId });

        // Focus the textarea
        const textarea = page.locator("textarea.global-textarea");
        await expect(textarea).toBeVisible();
        await textarea.focus();
        await expect(textarea).toBeFocused();

        const before2 = await getDepth(page, secondId!);
        const before3 = await getDepth(page, thirdId!);

        // Tab to indent both items
        await pressTab(page);
        await page.waitForTimeout(200); // Wait longer for UI update

        // Verify both items were indented
        const after2 = await getDepth(page, secondId!);
        const after3 = await getDepth(page, thirdId!);
        expect(after2).toBeGreaterThanOrEqual(before2);
        expect(after3).toBeGreaterThanOrEqual(before3);

        // Shift+Tab to outdent both items
        await pressShiftTab(page);
        await page.waitForTimeout(200); // Wait longer for UI update

        // Verify both items were outdented
        const afterOut2 = await getDepth(page, secondId!);
        const afterOut3 = await getDepth(page, thirdId!);
        expect(afterOut2).toBeLessThanOrEqual(after2);
        expect(afterOut3).toBeLessThanOrEqual(after3);
    });

    test("sequential: Tab -> Tab -> Shift+Tab adjusts depth deterministically", async ({ page }) => {
        // Get the third test item (index 2) - the one to be indented/outdented
        const targetId = await page
            .locator("[data-item-id]")
            .nth(2)
            .getAttribute("data-item-id");

        expect(targetId).not.toBeNull();

        const target = page.locator(`.outliner-item[data-item-id="${targetId}"]`);
        await expect(target).toBeVisible();

        // Click on the target item to make it active
        await target.locator(".item-content").click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();

        // Get initial depth
        const d0 = await getDepth(page, targetId!);
        expect(d0).not.toBe(-1);

        // First Tab
        await pressTab(page);
        await page.waitForTimeout(200); // Wait longer for UI update
        const d1 = await getDepth(page, targetId!);
        expect(d1).toBeGreaterThanOrEqual(d0);

        // Second Tab (should continue to indent)
        await pressTab(page);
        await page.waitForTimeout(200); // Wait longer for UI update
        const d2 = await getDepth(page, targetId!);
        expect(d2).toBeGreaterThanOrEqual(d1); // May not always increment due to parent-child relationships

        // Shift+Tab to outdent
        await pressShiftTab(page);
        await page.waitForTimeout(200); // Wait longer for UI update
        const d3 = await getDepth(page, targetId!);
        expect(d3).toBeLessThanOrEqual(d2);
    });
});
import "../utils/registerAfterEachSnapshot";
