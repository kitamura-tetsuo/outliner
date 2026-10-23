import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DEL-0001
 *  Title   : Project Deletion Page
 *  Source  : docs/client-features/del-project-deletion-page-c8da7a47.yaml
 */
import { expect, test } from "@playwright/test";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

test.describe("DEL-0001: Project Deletion Page", () => {
    test("first-attempt deletion removes the selected project", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        const timestamp = Date.now();
        const keeperName = `DEL Keeper ${timestamp}`;
        const targetName = `DEL Target ${timestamp}`;
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

        const listProjects = async (): Promise<string[]> => {
            const response = await page.request.get("/api/projects", {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            expect(response.ok(), await response.text()).toBeTruthy();
            const body = await response.json() as { projects: { projectId: string; }[]; };
            return body.projects.map(project => project.projectId);
        };

        // The fixture must be listed and accessible before acting.
        await expect.poll(listProjects, { timeout: 30000 }).toContain(targetId);
        await expect.poll(listProjects, { timeout: 30000 }).toContain(keeperId);

        await page.goto("/projects/delete");
        await page.waitForFunction(() =>
            typeof (globalThis as unknown as { __USER_MANAGER__?: { loginWithEmailPassword?: unknown; }; })
                .__USER_MANAGER__?.loginWithEmailPassword === "function"
        );
        await TestHelpers.login(page);
        await expect(page.getByRole("heading", { name: "Delete Projects" })).toBeVisible();
        const keeperRow = page.getByRole("row").filter({ hasText: keeperId });
        const targetRow = page.getByRole("row").filter({ hasText: targetId });
        await expect(keeperRow).toBeVisible();
        await expect(targetRow).toBeVisible();
        await expect(targetRow.getByRole("checkbox")).toBeEnabled();
        await targetRow.getByRole("checkbox").check();
        await page.getByTestId("delete-selected-button").click();

        // The expected successful outcome for the selected project, not any error.
        await expect(page.getByTestId("delete-success"))
            .toContainText("Selected projects have been deleted", { timeout: 60000 });
        await expect(page.getByTestId("delete-error")).toHaveCount(0);

        // Independently verify the authoritative membership/record state:
        // the selected project is gone while the unselected control remains.
        await expect.poll(listProjects, { timeout: 30000 }).not.toContain(targetId);
        await expect.poll(listProjects, { timeout: 30000 }).toContain(keeperId);

        // Verify the corresponding list after a real reload, without timed waits
        // or retrying the deletion/setup sequence.
        await page.reload();
        await expect(page.getByRole("heading", { name: "Delete Projects" })).toBeVisible();
        await expect(page.getByRole("row").filter({ hasText: keeperId })).toBeVisible();
        await expect(page.getByRole("row").filter({ hasText: targetId })).toHaveCount(0);
    });
});
