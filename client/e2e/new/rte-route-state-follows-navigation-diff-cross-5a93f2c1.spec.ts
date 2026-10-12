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

const historyLink = (page: Page) => page.locator("a:visible", { hasText: "History / Diff" });
const heading = (page: Page) => page.locator("#diff-modal-title");
const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });

// The history/diff routes stay mounted when only their parameters change; the
// project parameter is part of the identity just like the page parameter.
test.describe("RTE-5a93f2c1: history/diff routes follow project and demo navigation", () => {
    test(
        "traversal between two projects' diff routes shows the routed project and page",
        async ({ page }, testInfo) => {
            test.setTimeout(120000);
            const otherProject = `rte-diff-other-${Date.now()}`;
            const otherPage = "other-diff-page";
            const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
                `[/${otherProject}/${otherPage}]`,
            ]);
            await TestHelpers.seedProjectDataOnly(page, null, ["Other project content"], {
                projectName: otherProject,
                pageName: otherPage,
            });
            const encodedProject = encodeURIComponent(projectName);
            const diffA = new RegExp(`/${encodedProject}/${encodeURIComponent(pageName)}/diff$`);
            const diffOther = new RegExp(`/${otherProject}/${otherPage}/diff$`);

            await expect(page.locator(".page-title-content .item-text")).toContainText(pageName, { timeout: 30000 });
            await followLink(page, historyLink(page), diffA);
            await expect(heading(page)).toHaveText(`History / Diff — ${pageName}`);
            await expect(breadcrumb(page).getByRole("link", { name: projectName })).toBeVisible();

            await followLink(
                page,
                breadcrumb(page).getByRole("link", { name: pageName }),
                new RegExp(`/${encodedProject}/${encodeURIComponent(pageName)}$`),
            );
            await followLink(
                page,
                page.locator(`a[href="/${otherProject}/${otherPage}"]`),
                new RegExp(`/${otherProject}/${otherPage}$`),
            );
            await followLink(page, historyLink(page), diffOther);
            await expect(heading(page)).toHaveText(`History / Diff — ${otherPage}`);
            await expect(breadcrumb(page).getByRole("link", { name: otherProject })).toBeVisible();

            // Back to the first project's diff route: both parameters change at once.
            await page.evaluate(() => history.go(-3));
            await expect(page).toHaveURL(diffA);
            await expect(heading(page)).toHaveText(`History / Diff — ${pageName}`);
            await expect(breadcrumb(page).getByRole("link", { name: projectName })).toBeVisible();
            await expect(breadcrumb(page).getByRole("link", { name: otherProject })).toHaveCount(0);
        },
    );

    test("traversal between two demo pages' diff routes shows the routed page", async ({ page }) => {
        test.setTimeout(120000);
        const stamp = Date.now();
        const titleA = `Diff Route A ${stamp}`;
        const titleB = `Diff Route B ${stamp}`;
        // Demo pages of our own, so the shared demo content stays untouched.
        // B first: A is created last and stays open to link to B.
        for (const title of [titleB, titleA]) {
            await page.goto(`/demo/${encodeURIComponent(title)}`);
            await expect(page.getByText("Page not found")).toBeVisible({ timeout: 30000 });
            await page.getByRole("button", { name: "Create Page" }).click();
            await expect(page.locator(".outliner-item.page-title").first()).toContainText(title, { timeout: 30000 });
        }
        // Link A to B through the editor, the way a visitor would.
        await page.locator(".outliner-item.page-title[data-item-id] .item-content").first().click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.insertText(`[${titleB}]`);
        await page.keyboard.press("Enter");
        await page.keyboard.type("x");

        const pathA = `/demo/${encodeURIComponent(titleA)}`;
        const pathB = `/demo/${encodeURIComponent(titleB)}`;
        const diffA = new RegExp(`${pathA}/diff$`);
        const diffB = new RegExp(`${pathB}/diff$`);

        await followLink(page, historyLink(page), diffA);
        await expect(heading(page)).toHaveText(`History / Diff — ${titleA}`);
        await followLink(page, breadcrumb(page).getByRole("link", { name: titleA }), new RegExp(`${pathA}$`));
        await followLink(page, page.locator(`a.internal-link[href="${pathB}"]`), new RegExp(`${pathB}$`));
        await followLink(page, historyLink(page), diffB);
        await expect(heading(page)).toHaveText(`History / Diff — ${titleB}`);

        await page.evaluate(() => history.go(-3));
        await expect(page).toHaveURL(diffA);
        await expect(heading(page)).toHaveText(`History / Diff — ${titleA}`);
    });
});
