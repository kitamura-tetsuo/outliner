/* eslint-disable no-restricted-globals */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature PRS-0001
 *  Title   : Show real-time presence indicators
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

let projectName: string;
let pageName: string;

test.describe("PRS-0001: presence indicators", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo, ["first line"]);
        projectName = ids.projectName;
        pageName = ids.pageName;
    });

    test("shows multiple user avatars", async ({ page }) => {
        await page.goto(`/${projectName}/${pageName}`);

        // Wait for presence elements to be visible
        await expect(page.locator('[data-testid="presence-row"]')).toBeVisible({ timeout: 10000 });

        // Wait for user to be authenticated
        await expect(page.locator('[data-testid="login-status-indicator"]')).toHaveAttribute(
            "data-status",
            "authenticated",
            { timeout: 10000 },
        );

        // Debug presence store state
        const presenceDebug = await page.evaluate(() => {
            const store = (window as any).presenceStore;
            return {
                presenceStoreExists: !!store,
                users: store ? store.getUsers() : [],
            };
        });
        console.log("Presence debug info:", presenceDebug);

        // Verify existing user (automatically added user)
        const avatars = page.locator('[data-testid="presence-row"] .presence-avatar');
        await expect(avatars).toHaveCount(1, { timeout: 10000 });

        // Manually add a second user for testing
        await page.evaluate(() => {
            const store = (window as any).presenceStore;
            if (store) {
                store.setUser({
                    userId: "test-user-2",
                    userName: "Test User 2",
                    color: "hsl(30, 70%, 50%)", // Use orange to avoid collision with default user color
                });
            }
        });

        // Wait for two avatars to be displayed
        await expect(avatars).toHaveCount(2, { timeout: 10000 });

        const firstColor = await avatars.nth(0).evaluate(el => getComputedStyle(el).backgroundColor);
        const secondColor = await avatars.nth(1).evaluate(el => getComputedStyle(el).backgroundColor);
        expect(firstColor).not.toBe("");
        expect(secondColor).not.toBe("");
        expect(firstColor).not.toBe(secondColor);

        // Verify avatar count decreases after removing user
        await page.evaluate(() => {
            const store = (window as any).presenceStore;
            if (store) {
                store.removeUser("test-user-2");
            }
        });

        await expect(avatars).toHaveCount(1, { timeout: 10000 });
    });
});
