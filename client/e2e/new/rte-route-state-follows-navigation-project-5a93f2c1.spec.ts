/** @feature RTE-5a93f2c1
 *  Title   : Route parameters and query state follow client-side navigation
 *  Source  : docs/client-features/rte-route-state-follows-navigation-5a93f2c1.yaml
 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

// The `/:project/:page` route component stays mounted when only `:page`
// changes; its project/page names must be derived from `$app/state` so both an
// in-app link and a back navigation load the page the URL names.
test.describe("RTE-5a93f2c1: project page route follows navigation", () => {
    test("an internal link and a back navigation each show the page the URL names", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "[route-target-page]",
        ]);
        await TestHelpers.seedProjectDataOnly(page, null, ["Route target content"], {
            projectName,
            pageName: "route-target-page",
        });

        const encodedProject = encodeURIComponent(projectName);
        const pageTitle = page.locator(".page-title-content .item-text");
        await expect(pageTitle).toContainText(pageName, { timeout: 30000 });

        await page.locator(`a.internal-link[href="/${encodedProject}/route-target-page"]`).click();
        await expect(page).toHaveURL(new RegExp(`/${encodedProject}/route-target-page$`));
        await expect(pageTitle).toContainText("route-target-page", { timeout: 30000 });
        await expect(page.locator(".outliner-item[data-item-id] .item-text", { hasText: "Route target content" }))
            .toBeVisible({ timeout: 30000 });

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`/${encodedProject}/${encodeURIComponent(pageName)}`));
        await expect(pageTitle).toContainText(pageName, { timeout: 30000 });
    });
});
