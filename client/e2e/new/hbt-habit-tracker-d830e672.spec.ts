import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-d830e672
 *  Title   : SQL-backed Habit Tracker
 *  Source  : docs/client-features/hbt-sql-habit-tracker-d830e672.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

test.describe("FTR-d830e672: Habit tracker", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Habit list"]);
    });

    test("adds a habit, toggles today's completion and shows the streak", async ({ page }) => {
        await page.waitForSelector(".outliner-item", { timeout: 20000 });

        const componentSelector = page.locator(".component-selector select").first();
        await componentSelector.selectOption("habits");
        await expect(componentSelector).toHaveValue("habits");

        const tracker = page.locator('[data-testid="habit-tracker"]');
        await expect(tracker).toBeVisible({ timeout: 15000 });
        await expect(tracker.getByText("No habits yet. Add one above.")).toBeVisible();

        // Add a daily habit through the form.
        await tracker.getByLabel("Habit name").fill("Stretch");
        await tracker.getByLabel("Habit interval in days").fill("1");
        await tracker.getByLabel("Add habit").click();
        await expect(tracker.locator(".habit-name")).toHaveText("Stretch");

        // Toggle today's cell in the 7-day grid.
        const now = new Date();
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const toggle = tracker.getByLabel(`Toggle Stretch on ${today}`);
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "true");

        // The SQL-computed streak reflects today's completion.
        await expect(tracker.getByTestId("habit-streak")).toContainText("1");

        // Toggling the same day again removes the completion log.
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await expect(tracker.getByTestId("habit-streak")).toHaveText("–");
    });
});
