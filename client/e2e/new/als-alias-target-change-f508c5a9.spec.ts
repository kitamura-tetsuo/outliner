import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("ALS-0001: Alias change target", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "This is a test page. 1",
            "This is a test page. 2",
            "This is a test page. 3",
        ]);
    });

    test("change alias target and update path", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // Retry logic for fetching IDs
        let firstId = await TestHelpers.getItemIdByIndex(page, 0);
        if (!firstId) {
            await page.waitForTimeout(1000);
            firstId = await TestHelpers.getItemIdByIndex(page, 0);
        }

        let secondId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!secondId) {
            await page.waitForTimeout(1000);
            secondId = await TestHelpers.getItemIdByIndex(page, 1);
        }

        let thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!thirdId) {
            await page.waitForTimeout(1000);
            thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        }

        if (!firstId || !secondId || !thirdId) throw new Error("item ids not found");

        // create alias of first item
        await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForUIStable(page);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await TestHelpers.waitForUIStable(page);
        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");

        // Set initial target (secondId) - confirm via store without relying on UI
        await page.evaluate(({ aliasId, secondId }) => {
            const store: any = (window as any).aliasPickerStore;
            if (store) {
                store.show(aliasId);
                store.confirmById(secondId);
            }
        }, { aliasId, secondId });
        await expect(page.locator(".alias-picker").first()).toBeHidden();

        // Verify that the alias item has been created
        await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).waitFor({ state: "visible", timeout: 5000 });

        // Wait for reflection to Yjs model (check via polling)
        await TestHelpers.waitForUIStable(page);

        // Verify that the initial aliasTargetId is set correctly
        let deadline = Date.now() + 5000;
        let aliasTargetId: string | null = null;
        while (Date.now() < deadline) {
            aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
            if (aliasTargetId === secondId) break;
            await page.waitForTimeout(100);
        }
        expect(aliasTargetId).toBe(secondId);

        // Verify that the alias path is displayed
        let isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);

        // Change alias target (change to thirdId) - confirm via store
        await page.evaluate(({ aliasId, thirdId }) => {
            const store: any = (window as any).aliasPickerStore;
            if (store) {
                store.show(aliasId);
                store.confirmById(thirdId);
            }
        }, { aliasId, thirdId });

        // Wait for reflection to Yjs model (check via polling)
        await TestHelpers.waitForUIStable(page);

        // Verify that the updated aliasTargetId is set correctly
        deadline = Date.now() + 5000;
        aliasTargetId = null;
        while (Date.now() < deadline) {
            aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
            if (aliasTargetId === thirdId) break;
            await page.waitForTimeout(100);
        }
        expect(aliasTargetId).toBe(thirdId);

        // Verify that the alias path has been updated
        isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);
    });
});
