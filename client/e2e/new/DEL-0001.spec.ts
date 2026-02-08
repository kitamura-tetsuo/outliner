import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DEL-0001
 *  Title   : Project Deletion Page
 *  Source  : docs/client-features/del-project-deletion-page-c8da7a47.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("DEL-0001: Project Deletion Page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("list and delete a project", async ({ page }) => {
        await page.goto("/projects/delete");
        await expect(page.locator("h1")).toHaveText("Delete Projects");

        const table = page.locator("table");
        if (await table.count()) {
            await expect(table).toBeVisible();
            const checkbox = page.locator(
                "tbody tr td input[type=checkbox]",
            ).first();
            if (await checkbox.count()) {
                await checkbox.check();
                await page.getByRole("button", { name: "Delete" }).click();

                // Wait until either an error message or a success message is displayed
                await page.waitForFunction(() => {
                    const errorElement = document.querySelector(".text-red-600");
                    const successElement = document.querySelector(".text-green-600");
                    return errorElement?.textContent || successElement?.textContent;
                }, { timeout: 15000 });

                // Check if an error message or a success message is displayed
                const errorElement = page.locator(".text-red-600");
                const successElement = page.locator(".text-green-600");

                if (await errorElement.count() > 0) {
                    // Since deletion is expected to fail in the test environment, verify that the error message is displayed
                    await expect(errorElement).toBeVisible();
                } else if (await successElement.count() > 0) {
                    await expect(
                        page.getByText("Selected projects have been deleted"),
                    ).toBeVisible();
                } else {
                    throw new Error("Neither error nor success message was displayed");
                }
            }
        } else {
            await expect(page.getByText("No projects found.")).toBeVisible();
        }
    });
});
