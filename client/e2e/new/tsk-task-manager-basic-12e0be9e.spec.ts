import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-12e0be9e
 *  Title   : SQL-backed Task Manager
 *  Source  : docs/client-features/tsk-sql-task-manager-12e0be9e.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-12e0be9e: Task manager basics", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Task list"]);
    });

    test("offers the Tasks component type in the item dropdown", async ({ page }) => {
        await page.waitForSelector(".outliner-item", { timeout: 20000 });

        const componentSelector = page.locator(".component-selector select").first();
        await expect(componentSelector).toBeVisible();
        const options = await componentSelector.locator("option").allTextContents();
        expect(options).toContain("Tasks");
    });

    test("adds a task with a registration time and completes it", async ({ page }) => {
        await page.waitForSelector(".outliner-item", { timeout: 20000 });

        const componentSelector = page.locator(".component-selector select").first();
        await componentSelector.selectOption("tasks");
        await expect(componentSelector).toHaveValue("tasks");

        const manager = page.locator('[data-testid="task-manager"]');
        await expect(manager).toBeVisible({ timeout: 15000 });
        await expect(manager.getByText("No tasks in this view.")).toBeVisible();

        // Add a task through the form.
        await manager.getByLabel("Task title").fill("Buy milk");
        await manager.getByLabel("Add task").click();

        const row = manager.locator(".task-row");
        await expect(row).toHaveCount(1);
        await expect(row.locator(".task-title")).toHaveText("Buy milk");
        // The registration timestamp is recorded and displayed.
        await expect(row.locator(".created-at")).toContainText(/\d{4}-\d{2}-\d{2}/);

        // Complete the task via its checkbox.
        await manager.getByLabel("Complete Buy milk").check();

        // The Completed view (computed via SQL) lists it with a completion timestamp.
        await manager.getByRole("tab", { name: "Completed (1)" }).click();
        await expect(row.locator(".task-title")).toHaveText("Buy milk");
        await expect(row).toHaveClass(/done/);
        await expect(row.locator(".badge.completed-at")).toBeVisible();
    });
});
