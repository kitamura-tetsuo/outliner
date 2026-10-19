import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Deletion", () => {
    test("should allow deleting a project", async ({ page }, testInfo) => {
        const timestamp = Date.now();
        const keeperName = `Keeper Project ${timestamp}`;
        const targetName = `Target Project ${timestamp}`;
        await TestHelpers.seedProjectDataOnly(page, testInfo, [], { projectName: keeperName });
        await TestHelpers.seedProjectDataOnly(page, testInfo, [], { projectName: targetName });
        const keeperId = SeedClient.stableIdFromTitle(keeperName);
        const targetId = SeedClient.stableIdFromTitle(targetName);
        const idToken = await TestHelpers.getTestAuthToken();

        // Use the same API route and canonical title as normal project saving.
        // The old fixed emulator address bypassed the application's API routing.
        for (const [projectId, title] of [[keeperId, keeperName], [targetId, targetName]]) {
            const response = await page.request.post("/api/saveProject", {
                data: { idToken, projectId, title },
            });
            expect(response.ok(), await response.text()).toBeTruthy();
        }

        await page.goto("/projects/delete");
        await page.waitForFunction(() =>
            typeof (globalThis as any).__USER_MANAGER__?.loginWithEmailPassword === "function"
        );
        await TestHelpers.login(page);
        await expect(page.getByRole("heading", { name: "Delete Projects" })).toBeVisible();
        const keeperRow = page.getByRole("row").filter({ hasText: keeperId });
        const targetRow = page.getByRole("row").filter({ hasText: targetId });
        await expect(keeperRow).toBeVisible();
        await expect(targetRow).toBeVisible();
        await targetRow.getByRole("checkbox").check();
        await page.getByRole("button", { name: /Delete/ }).click();
        await expect(page.getByText("Selected projects have been deleted", { exact: true })).toBeVisible();

        // Verify persisted membership after a real reload, without timed waits
        // or retrying the deletion/setup sequence.
        await page.reload();
        await expect(keeperRow).toBeVisible();
        await expect(targetRow).toHaveCount(0);
    });
});
