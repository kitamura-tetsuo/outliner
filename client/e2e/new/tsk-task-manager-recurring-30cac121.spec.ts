import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-12e0be9e
 *  Title   : SQL-backed Task Manager (recurring tasks and SQL views)
 *  Source  : docs/client-features/tsk-sql-task-manager-12e0be9e.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

function localDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test.describe("FTR-12e0be9e: Recurring tasks and SQL views", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Task list"]);
    });

    test("a due-today repeating task shows in Today and spawns the next occurrence", async ({ page }) => {
        await page.waitForSelector(".outliner-item", { timeout: 20000 });

        const componentSelector = page.locator(".component-selector select").first();
        await componentSelector.selectOption("tasks");

        const manager = page.locator('[data-testid="task-manager"]');
        await expect(manager).toBeVisible({ timeout: 15000 });

        const now = new Date();
        const today = localDate(now);
        const nextDue = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3));

        // Add a task due at the end of today that repeats every 3 days.
        await manager.getByLabel("Task title").fill("Water plants");
        await manager.getByLabel("Due date and time").fill(`${today}T23:59`);
        await manager.getByLabel("Repeat interval in days").fill("3");
        await manager.getByLabel("Add task").click();

        // The SQL "today" view counts and lists the task.
        await manager.getByRole("tab", { name: "Today (1)" }).click();
        await expect(manager.locator(".task-row .task-title")).toHaveText("Water plants");
        await expect(manager.locator(".task-row .badge.repeat")).toContainText("3d");

        // Completing the repeating task automatically schedules the next occurrence.
        // (click, not check: the row leaves the Today view once completed, so a
        // post-action checked-state verification would never resolve)
        await manager.getByLabel("Complete Water plants").click();
        await expect(manager.getByRole("tab", { name: "Completed (1)" })).toBeVisible();

        // The spawned occurrence is due 3 days later and appears in Upcoming.
        await manager.getByRole("tab", { name: "Upcoming (1)" }).click();
        const spawned = manager.locator(".task-row");
        await expect(spawned).toHaveCount(1);
        await expect(spawned.locator(".task-title")).toHaveText("Water plants");
        await expect(spawned.locator(".badge.due")).toContainText(nextDue);

        // The All view shows both the completed and the spawned occurrence.
        await manager.getByRole("tab", { name: "All (2)" }).click();
        await expect(manager.locator(".task-row")).toHaveCount(2);
    });
});
