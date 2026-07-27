/**
 * ENV-2c9b1a4d: Stryker nightly schedule visibility
 *
 * Verifies that the Stryker nightly suite is correctly displayed
 * on the environment schedule page.
 *
 * The page authenticates through UserManager, so the test signs in against the
 * Firebase Auth emulator and asserts that the request is actually issued with a
 * real ID token in the Authorization header.
 */

import type { Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

type ScheduleFixture = {
    id: string;
    strategy: string;
    cadence?: string;
    lastRunAt?: string;
};

/**
 * Fulfills /api/list-schedules and asserts the page sends the pageId in the
 * request body together with a bearer token obtained from Firebase Auth.
 */
async function fulfillListSchedules(route: Route, schedules: ScheduleFixture[]): Promise<void> {
    const request = route.request();
    expect(request.method()).toBe("POST");

    const authorization = await request.headerValue("authorization");
    expect(authorization).toMatch(/^Bearer .+/);

    expect(request.postDataJSON()).toEqual({ pageId: "mutation-jobs" });

    await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ schedules }),
    });
}

test.describe("ENV-2c9b1a4d: Stryker nightly schedule visibility", () => {
    test.beforeEach(async ({ page }) => {
        // The schedule page has no login UI, so sign in first and let Firebase
        // persist the session for the navigations the tests perform.
        // Loading /schedule without a pageId is enough: the route imports
        // UserManager (which publishes __USER_MANAGER__) but returns before
        // fetching, so no request escapes ahead of the route mocks.
        await page.goto("/schedule");
        await page.waitForFunction(
            () => !!(globalThis as unknown as { __USER_MANAGER__?: unknown; }).__USER_MANAGER__,
            { timeout: 30000 },
        );
        await TestHelpers.login(page);
    });

    test("Row is displayed when API response contains Stryker job", async ({ page }) => {
        await page.route("**/api/list-schedules**", (route) =>
            fulfillListSchedules(route, [
                {
                    id: "stryker-nightly",
                    strategy: "Stryker nightly mutation suite",
                    cadence: "0 18 * * *",
                    lastRunAt: "2024-01-01T00:00:00.000Z",
                },
            ]));

        const response = page.waitForResponse("**/api/list-schedules**");
        await page.goto("/schedule?pageId=mutation-jobs");
        await response;

        const row = page.locator('[data-schedule-id="stryker-nightly"]');
        await expect(row).toBeVisible();

        const cells = row.locator("td");
        await expect(cells.nth(0)).toHaveText("Stryker nightly mutation suite");
        await expect(cells.nth(1)).toHaveText("0 18 * * *");
        await expect(cells.nth(2)).toHaveText("2024-01-01 00:00:00Z");
    });

    test("Row is not rendered for empty response", async ({ page }) => {
        await page.route("**/api/list-schedules**", (route) => fulfillListSchedules(route, []));

        const response = page.waitForResponse("**/api/list-schedules**");
        await page.goto("/schedule?pageId=mutation-jobs");
        await response;

        await expect(page.locator("tbody tr")).toHaveCount(0);
    });

    test("Displays a dash if lastRunAt does not exist", async ({ page }) => {
        await page.route("**/api/list-schedules**", (route) =>
            fulfillListSchedules(route, [
                {
                    id: "stryker-nightly",
                    strategy: "Stryker nightly mutation suite",
                    cadence: "0 18 * * *",
                },
            ]));

        const response = page.waitForResponse("**/api/list-schedules**");
        await page.goto("/schedule?pageId=mutation-jobs");
        await response;

        const row = page.locator('[data-schedule-id="stryker-nightly"]');
        await expect(row).toBeVisible();
        await expect(row.locator("td").nth(2)).toHaveText("—");
    });
});
