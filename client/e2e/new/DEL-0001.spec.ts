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
                "tbody tr td input[type=checkbox]"
            ).first();
            if (await checkbox.count()) {
                await checkbox.check();
                await page.getByRole("button", { name: "Delete" }).click();
                await expect(
                    page.getByText("選択したプロジェクトを削除しました")
                ).toBeVisible();
            }
        } else {
            await expect(page.getByText("No projects found.")).toBeVisible();
        }
    });
});
