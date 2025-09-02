/** @feature PRS-0001
 *  Title   : Show real-time presence indicators
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

let projectName: string;
let pageName: string;

test.describe("PRS-0001: presence indicators", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo, ["first line"]);
        projectName = ids.projectName;
        pageName = ids.pageName;
    });
    test("shows multiple user avatars", async ({ page, browser }, testInfo) => {
        await page.goto(`/${projectName}/${pageName}`);

        // プレゼンス要素が表示されるまで待つ
        await expect(page.locator('[data-testid="presence-row"]')).toBeVisible({ timeout: 10000 });
        // FluidClientが初期化されるまで待つ
        await page.waitForTimeout(3000);

        // プレゼンスストアの状態をデバッグ
        const presenceDebug = await page.evaluate(() => {
            const store = (window as any).presenceStore;

            const fluidStore = (window as any).__FLUID_STORE__;

            return {
                presenceStoreExists: !!store,

                users: store ? store.getUsers() : [],

                fluidClientExists: !!fluidStore?.fluidClient,

                containerExists: !!fluidStore?.fluidClient?.container,

                servicesExists: !!fluidStore?.fluidClient?.services,
            };
        });
        console.log("Presence debug info:", presenceDebug);

        // 既存のユーザーがいることを確認（自動的に追加されたユーザー）
        const avatars = page.locator('[data-testid="presence-row"] .presence-avatar');

        await expect(avatars).toHaveCount(1, { timeout: 10000 });
        // 手動で2番目のユーザーを追加してテスト
        await page.evaluate(() => {
            const store = (window as any).presenceStore;

            if (store) {
                store.setUser({
                    userId: "test-user-2",

                    userName: "Test User 2",

                    color: "hsl(240, 70%, 50%)",
                });
            }
        });
        // 2つのアバターが表示されるまで待つ
        await expect(avatars).toHaveCount(2, { timeout: 10000 });
        const firstColor = await avatars.nth(0).evaluate(el => getComputedStyle(el).backgroundColor);

        const secondColor = await avatars.nth(1).evaluate(el => getComputedStyle(el).backgroundColor);
        expect(firstColor).not.toBe("");
        expect(secondColor).not.toBe("");
        expect(firstColor).not.toBe(secondColor);

        // ユーザーを削除してアバターが減ることを確認
        await page.evaluate(() => {
            const store = (window as any).presenceStore;

            if (store) {
                store.removeUser("test-user-2");
            }
        });
        await expect(avatars).toHaveCount(1, { timeout: 10000 });
    });
});
