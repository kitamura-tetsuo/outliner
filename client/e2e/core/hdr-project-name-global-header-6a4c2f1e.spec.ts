import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature HDR-6a4c2f1e
 *  Title   : Project name in the global header
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("HDR-6a4c2f1e: Project name in the global header (project pages)", () => {
    test("the toolbar names the project and the page chrome stops repeating it", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(
            page,
            testInfo,
            ["First body line"],
        );
        await TestHelpers.waitForAppReady(page);

        // The global header carries the project identity.
        const projectLabel = page.getByTestId("toolbar-project-name");
        await expect(projectLabel).toBeVisible({ timeout: 30000 });
        await expect(projectLabel).toHaveText(projectName);

        // ...and the page view no longer repeats it above the editor.
        await expect(page.locator('nav[aria-label="Breadcrumb"]')).toHaveCount(0);
        await expect(page.locator('nav a:has-text("Home")')).toHaveCount(0);
        await expect(page.locator("main h1")).toHaveCount(0);

        // The editable page title stays the single primary page-title display.
        const titleItem = page.locator(".outliner-item.page-title[data-item-id]").first();
        await expect(titleItem).toBeVisible({ timeout: 30000 });
        await expect(titleItem).toContainText(pageName);
    });

    test("the editable page title still accepts edits", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First body line"], undefined, {
            pageName: "Editable Title",
        });
        await TestHelpers.waitForAppReady(page);

        const titleItem = page.locator(".outliner-item.page-title[data-item-id]").first();
        await expect(titleItem).toBeVisible({ timeout: 30000 });
        const itemId = await titleItem.getAttribute("data-item-id");
        if (!itemId) throw new Error("page title item has no data-item-id");

        await TestHelpers.setCursor(page, itemId, 0);
        await page.waitForTimeout(500);
        await TestHelpers.insertText(page, itemId, "New ");
        await page.waitForTimeout(500);

        await expect(titleItem).toContainText("New Editable Title");
    });

    test("page actions survive the removal of the heading row", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First body line"]);
        await TestHelpers.waitForAppReady(page);

        const actions = page.getByTestId("page-toolbar");
        await expect(actions).toBeVisible({ timeout: 30000 });
        // The action row carries actions only — never project or page identity.
        await expect(actions).not.toContainText(projectName);

        await expect(page.getByTestId("search-toggle-button")).toBeVisible();
        await expect(actions.getByText("Schedule")).toBeVisible();
        await expect(page.getByTestId("graph-view-button")).toBeVisible();

        await page.getByTestId("search-toggle-button").click();
        await expect(page.getByTestId("search-panel")).toBeVisible({ timeout: 15000 });
    });
});
