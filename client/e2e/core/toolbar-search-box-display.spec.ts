import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TOO-0001
 *  Title   : Toolbar SearchBox Display Feature
 *  Source  : manual test
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TOO-0001: Toolbar SearchBox Display Feature", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Toolbar is fixed at the top", async ({ page }) => {
        // Verify that the toolbar is displayed
        // Select the client-side mounted toolbar, not the SSR shell toolbar
        // The second element is the client-side toolbar
        const toolbar = page.getByTestId("main-toolbar").last();
        await expect(toolbar).toBeVisible();

        // Verify that the toolbar is in a fixed position
        const toolbarStyles = await toolbar.evaluate((el) => {
            const styles = window.getComputedStyle(el);
            return {
                position: styles.position,
                top: styles.top,
                zIndex: styles.zIndex,
            };
        });

        expect(toolbarStyles.position).toBe("fixed");
        expect(toolbarStyles.top).toBe("0px");
        expect(parseInt(toolbarStyles.zIndex)).toBeGreaterThan(999);
    });

    test("SearchBox is displayed within the toolbar", async ({ page }) => {
        // Verify that the SearchBox is displayed
        const searchBox = page.locator(".page-search-box");
        await expect(searchBox).toBeVisible();

        // Verify that the SearchBox is inside the toolbar
        // Select the client-side mounted toolbar, not the SSR shell toolbar
        // The second element is the client-side toolbar
        const toolbar = page.getByTestId("main-toolbar").last();
        const searchBoxInToolbar = toolbar.locator(".page-search-box");
        await expect(searchBoxInToolbar).toBeVisible();
    });

    test("Main content is displayed below the toolbar", async ({ page }) => {
        // Verify that the main content is displayed
        // Select the client-side mounted main-content, not the SSR shell main-content
        // The second element is the client-side main-content
        const mainContent = page.locator(".main-content").last();
        await expect(mainContent).toBeVisible();

        // Verify that padding is applied to the main content
        const mainContentStyles = await mainContent.evaluate((el) => {
            const styles = window.getComputedStyle(el);
            return {
                paddingTop: styles.paddingTop,
            };
        });

        // Verify that 4rem = 64px padding is applied
        expect(parseInt(mainContentStyles.paddingTop)).toBeGreaterThanOrEqual(60);
    });

    test("SearchBox input field is functional", async ({ page }) => {
        // Get the SearchBox input field
        // Select the client-side mounted input, not the SSR shell input
        // The second element is the client-side input
        const searchInput = page.locator(".page-search-box input").last();
        await expect(searchInput).toBeVisible();

        // Enter text into the input field
        await searchInput.fill("test");

        // Verify the entered value
        await expect(searchInput).toHaveValue("test");
    });
});
