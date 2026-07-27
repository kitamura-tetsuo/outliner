/**
 * ENV-2c9b1a4d: Stryker nightly schedule visibility
 *
 * Verifies that the Stryker nightly suite is correctly displayed
 * on the environment schedule page.
 */

import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("ENV-2c9b1a4d: Stryker nightly schedule visibility", () => {
    test.beforeEach(async ({ page, context }, testInfo) => {
        await TestHelpers.seedProjectAndNavigateForProject(page, testInfo);
        await page.evaluate(async () => {
            let attempts = 0;
            while (attempts < 50) {
                const mgr = (globalThis as any).__USER_MANAGER__;
                if (mgr?.loginWithEmailPassword) {
                    await mgr.loginWithEmailPassword("test@example.com", "password");
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            throw new Error("UserManager not available after waiting");
        });
        // Wait a bit to ensure login has completely propagated
        await page.waitForTimeout(500);
    });

    test("Row is displayed when API response contains Stryker job", async ({ page }) => {
        await page.route("**/api/list-schedules**", async (route) => {
            const url = new URL(route.request().url());
            expect(url.searchParams.get("pageId")).toBe("mutation-jobs");
            expect(url.searchParams.get("idToken")).toBeTruthy();

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    schedules: [
                        {
                            id: "stryker-nightly",
                            strategy: "Stryker nightly mutation suite",
                            cadence: "0 18 * * *",
                            lastRunAt: "2024-01-01T00:00:00.000Z",
                        },
                    ],
                }),
            });
        });

        const req = page.waitForResponse("**/api/list-schedules**");
        await page.goto("/schedule?pageId=mutation-jobs");
        await req;

        const row = page.locator('[data-schedule-id="stryker-nightly"]');
        await expect(row).toBeVisible();

        const cells = row.locator("td");
        await expect(cells.nth(0)).toHaveText("Stryker nightly mutation suite");
        await expect(cells.nth(1)).toHaveText("0 18 * * *");
        await expect(cells.nth(2)).toHaveText("2024-01-01 00:00:00Z");
    });

    test("Row is not rendered for empty response", async ({ page }) => {
        await page.route("**/api/list-schedules**", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ schedules: [] }),
            });
        });

        const req = page.waitForResponse("**/api/list-schedules**");
        await page.goto("/schedule?pageId=mutation-jobs");
        await req;

        await expect(page.locator("tbody tr")).toHaveCount(0);
    });

    test("Displays a dash if lastRunAt does not exist", async ({ page }) => {
        await page.route("**/api/list-schedules**", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    schedules: [
                        {
                            id: "stryker-nightly",
                            strategy: "Stryker nightly mutation suite",
                            cadence: "0 18 * * *",
                        },
                    ],
                }),
            });
        });

        const req = page.waitForResponse("**/api/list-schedules**");
        await page.goto("/schedule?pageId=mutation-jobs");
        await req;

        const row = page.locator('[data-schedule-id="stryker-nightly"]');
        await expect(row).toBeVisible();
        await expect(row.locator("td").nth(2)).toHaveText("—");
    });
});
