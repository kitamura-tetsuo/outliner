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

// SvelteKit keeps `/:project/:page/diff` mounted when only its parameters
// change. The diff page binds its heading, snapshot list and live Yjs content
// to the project/page it mounted with, so a reused instance would keep showing
// the previous page while the URL names another one.
test.describe("RTE-5a93f2c1: page history/diff route follows navigation", () => {
    test("history traversal between two pages' diff routes shows the routed page", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        const pageB = "route-diff-b";
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            `[${pageB}]`,
            "Diff A content",
        ]);
        await TestHelpers.seedProjectDataOnly(page, null, ["Diff B content"], { projectName, pageName: pageB });

        const encodedProject = encodeURIComponent(projectName);
        const diffA = new RegExp(`/${encodedProject}/${encodeURIComponent(pageName)}/diff$`);
        const diffB = new RegExp(`/${encodedProject}/${pageB}/diff$`);
        const heading = page.locator("#diff-modal-title");
        const snapshots = page.getByRole("list", { name: "Snapshots" }).getByRole("button");
        const noSnapshots = page.getByText("No snapshots available");
        const pageTitle = page.locator(".page-title-content .item-text");
        // The toolbar renders a desktop and a mobile variant; use the shown one.
        const historyLink = page.locator("a:visible", { hasText: "History / Diff" });

        // Page A: take a snapshot of its live content.
        await expect(pageTitle).toContainText(pageName, { timeout: 30000 });
        await followLink(page, historyLink, diffA);
        await expect(heading).toHaveText(`History / Diff — ${pageName}`);
        await page.getByRole("button", { name: "Add Snapshot" }).click();
        await expect(snapshots).toHaveCount(1);

        // Page B, reached through the app's own links: its own (empty) history.
        await followLink(
            page,
            page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: pageName }),
            new RegExp(`/${encodedProject}/${encodeURIComponent(pageName)}$`),
        );
        await followLink(
            page,
            page.locator(`a.internal-link[href="/${encodedProject}/${pageB}"]`),
            new RegExp(`/${encodedProject}/${pageB}$`),
        );
        await expect(pageTitle).toContainText(pageB, { timeout: 30000 });
        await followLink(page, historyLink, diffB);
        await expect(heading).toHaveText(`History / Diff — ${pageB}`);
        await expect(noSnapshots).toBeVisible();

        // Straight back from B's diff route to A's: same route component, only
        // `:page` changes. Heading, snapshots and live content follow page A.
        await page.evaluate(() => history.go(-3));
        await expect(page).toHaveURL(diffA);
        await expect(heading).toHaveText(`History / Diff — ${pageName}`);
        await expect(snapshots).toHaveCount(1);
        await snapshots.first().click();
        await expect(page.locator(".diff-container")).toContainText("Diff A content", { timeout: 30000 });
        await expect(page.locator(".diff-container")).not.toContainText("Diff B content");
    });
});
