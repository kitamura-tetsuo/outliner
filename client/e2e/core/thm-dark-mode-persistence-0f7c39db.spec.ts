/** @feature THM-0002
 *  Title   : Dark mode preference persists
 *  Source  : docs/client-features/thm-dark-mode-persistence-0f7c39db.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("THM-0002: Dark mode preference persists", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("dark mode state restored after reload", async ({ page }) => {
        // initial state should be light mode
        await expect(page.evaluate(() => document.documentElement.classList.contains("dark"))).resolves.toBe(false);

        // enable dark mode
        await page.getByRole("button", { name: "Dark Mode" }).click();
        await expect(page.evaluate(() => document.documentElement.classList.contains("dark"))).resolves.toBe(true);

        // verify localStorage contains the dark theme preference
        const storedPreferences = await page.evaluate(() => {
            const stored = localStorage.getItem("user-preferences");
            return stored ? JSON.parse(stored) : null;
        });
        expect(storedPreferences).toEqual({ theme: "dark" });

        // reload and verify state persists
        await page.reload();

        // wait for page to load completely and UserManager to be initialized
        await page.waitForLoadState("domcontentloaded");
        await page.waitForFunction(
            () => (window as any).__USER_MANAGER__ !== undefined,
            { timeout: 30000 },
        );

        // wait for UserPreferencesStore to be initialized with correct theme
        await page.waitForFunction(() => {
            const store = (window as any).userPreferencesStore;
            return store && store.theme === "dark";
        }, { timeout: 10000 });

        // wait for the dark class to be applied to the document
        await page.waitForFunction(() => {
            return document.documentElement.classList.contains("dark");
        }, { timeout: 5000 });

        await expect(page.evaluate(() => document.documentElement.classList.contains("dark"))).resolves.toBe(true);
    });
});
