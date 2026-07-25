import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SRG-3f9c1a7d
 *  Title   : Search & Replace page title guard
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

const PAGE_NAME = "Search and Commands";

test.describe("SRG-3f9c1a7d: Search & Replace page title guard", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(
            page,
            testInfo,
            [
                "command palette entry",
            ],
            undefined,
            { pageName: PAGE_NAME },
        );
        await page.getByTestId("search-toggle-button").click();
        await expect(page.getByTestId("search-panel")).toBeVisible();
        await page.getByTestId("search-input").fill("command");
        await page.getByTestId("search-button").click();
    });

    test("Replace leaves the page title alone and keeps the route valid", async ({ page }) => {
        await page.getByTestId("replace-input").fill("shortcut");
        await page.getByTestId("replace-button").click();
        await page.waitForTimeout(500);

        // No confirmation dialog: nothing renames.
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
        // The route still points at the original page, and the title is untouched.
        expect(decodeURIComponent(new URL(page.url()).pathname)).toContain(`/${PAGE_NAME}`);
        await expect(page.locator(".outliner-item.page-title")).toContainText(PAGE_NAME);
        // The body item was replaced instead.
        await expect(
            page.locator(".outliner-item .item-text").filter({ hasText: "shortcut palette" }).first(),
        ).toBeVisible();
    });

    test("Including page titles confirms the rename and follows the new route", async ({ page }) => {
        await page.getByTestId("include-page-titles-checkbox").check();
        await page.getByTestId("replace-input").fill("Shortcut");
        await page.getByTestId("replace-button").click();

        // The rename must be confirmed before anything changes.
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(PAGE_NAME);
        await expect(page.locator(".outliner-item.page-title")).toContainText(PAGE_NAME);

        await dialog.locator("button:has-text('Rename and Replace')").click();
        await page.waitForTimeout(1000);

        // The open route follows the rename instead of 404-ing.
        const expectedName = "Search and Shortcuts";
        await expect(async () => {
            expect(decodeURIComponent(new URL(page.url()).pathname)).toContain(`/${expectedName}`);
        }).toPass({ timeout: 10000 });
        await expect(page.getByText("Page not found")).toHaveCount(0);
        await expect(page.locator(".outliner-item.page-title")).toContainText(expectedName);
    });

    test("Cancelling the rename confirmation changes nothing", async ({ page }) => {
        await page.getByTestId("include-page-titles-checkbox").check();
        await page.getByTestId("replace-input").fill("Shortcut");
        await page.getByTestId("replace-button").click();

        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await dialog.locator("button:has-text('Cancel')").click();
        await page.waitForTimeout(500);

        await expect(page.locator(".outliner-item.page-title")).toContainText(PAGE_NAME);
        await expect(
            page.locator(".outliner-item .item-text").filter({ hasText: "command palette" }).first(),
        ).toBeVisible();
    });
});
