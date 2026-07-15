import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-7d3e9a1c: The public /demo route shows the demo project (page list of
// feature demo pages) instead of a single page, without requiring login.
test.describe("Demo project feature tour", () => {
    test("the demo route shows the demo project's page list", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        for (
            const title of [
                "Welcome",
                "Formatting",
                "Outliner Basics",
                "Internal Links",
                "Search and Commands",
                "Selection and Clipboard",
                "Collaboration",
                "Comments and Votes",
                "Publishing and Sharing",
                "Advanced Features",
            ]
        ) {
            await expect(pageList.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 15000 });
        }
    });

    test("selecting a page opens it inside the demo project", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        await pageList.getByText("Formatting", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo\/Formatting$/, { timeout: 15000 });
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByText("This page demonstrates text formatting", { exact: false }).first(),
        ).toBeVisible({ timeout: 30000 });
    });
});
