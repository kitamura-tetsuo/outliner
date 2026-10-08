/** @feature RTE-5a93f2c1
 *  Title   : Route parameters and query state follow client-side navigation
 *  Source  : docs/client-features/rte-route-state-follows-navigation-5a93f2c1.yaml
 */
import "../utils/registerAfterEachSnapshot";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/** Clicks an in-app link until the router lands on `url` (the editor may swallow a click while it initializes). */
async function followLink(page: Page, link: Locator, url: RegExp): Promise<void> {
    await expect(async () => {
        await link.click();
        await expect(page).toHaveURL(url, { timeout: 3000 });
    }).toPass({ timeout: 30000 });
}

// SvelteKit keeps `/:project/:page/schedule` mounted when only `:page`
// changes. The schedule page resolves the page id every read and write targets
// when it mounts, so a reused instance would keep listing and writing the
// previous page's schedules while the URL names another page.
test.describe("RTE-5a93f2c1: page schedule route follows navigation", () => {
    const pageB = "route-schedule-b";

    async function addSchedule(page: Page, minutesAhead: number): Promise<void> {
        const time = new Date(Date.now() + minutesAhead * 60000).toISOString().slice(0, 16);
        await page.locator("#publish-time").fill(time);
        await page.getByRole("button", { name: "Add", exact: true }).click();
    }

    test(
        "history traversal between two pages' schedule routes reads and writes the routed page",
        async ({ page }, testInfo) => {
            test.setTimeout(120000);
            const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [`[${pageB}]`]);
            await TestHelpers.seedProjectDataOnly(page, null, ["Schedule B content"], { projectName, pageName: pageB });

            const encodedProject = encodeURIComponent(projectName);
            const scheduleA = new RegExp(`/${encodedProject}/${encodeURIComponent(pageName)}/schedule$`);
            const scheduleB = new RegExp(`/${encodedProject}/${pageB}/schedule$`);
            const items = page.getByTestId("schedule-item");
            const pageTitle = page.locator(".page-title-content .item-text");

            // Page A: one schedule.
            await expect(pageTitle).toContainText(pageName, { timeout: 30000 });
            await followLink(page, page.getByRole("link", { name: "Schedule", exact: true }), scheduleA);
            await addSchedule(page, 60);
            await expect(items).toHaveCount(1, { timeout: 15000 });

            // Page B (reached through the app's own links): none.
            await followLink(
                page,
                page.getByRole("link", { name: "Back", exact: true }),
                new RegExp(`/${encodedProject}/${encodeURIComponent(pageName)}$`),
            );
            await followLink(
                page,
                page.locator(`a.internal-link[href="/${encodedProject}/${pageB}"]`),
                new RegExp(`/${encodedProject}/${pageB}$`),
            );
            await expect(pageTitle).toContainText(pageB, { timeout: 30000 });
            const listedB = page.waitForResponse(r => r.url().includes("listSchedules"));
            await followLink(page, page.getByRole("link", { name: "Schedule", exact: true }), scheduleB);
            await listedB;
            await expect(items).toHaveCount(0);

            // Straight back from B's schedule route to A's: same route component,
            // only `:page` changes. It must show A's schedule and write to A.
            await page.evaluate(() => history.go(-3));
            await expect(page).toHaveURL(scheduleA);
            await expect(items).toHaveCount(1, { timeout: 15000 });
            await addSchedule(page, 120);
            await expect(items).toHaveCount(2, { timeout: 15000 });

            // B's schedules are untouched by the writes made on A's route.
            const relistedB = page.waitForResponse(r => r.url().includes("listSchedules"));
            await page.evaluate(() => history.go(3));
            await expect(page).toHaveURL(scheduleB);
            await relistedB;
            await expect(items).toHaveCount(0);
        },
    );
});
