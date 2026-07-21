import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Sidebar Scheduled SQL Section (SBD-7c1e9a2f)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Scheduled SQL sidebar demo item"]);
    });

    async function openSidebar(page: import("@playwright/test").Page) {
        const showBtn = page.locator('button[aria-label="Show sidebar"]');
        if (await showBtn.isVisible().catch(() => false)) {
            await showBtn.click();
        }
        const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
        await expect(sidebar).toBeVisible({ timeout: 10000 });
        return sidebar;
    }

    test("adds a scheduled SQL via + and navigates to its editor, then lists it", async ({ page }) => {
        const sidebar = await openSidebar(page);

        // Scheduled SQL section exists between Tables and Settings
        const scheduleToggle = sidebar.locator('button[aria-label="Toggle scheduled SQL section"]');
        await expect(scheduleToggle).toBeVisible();

        // Initially empty
        const schedulesList = sidebar.locator("#sidebar-schedules-list");
        await expect(schedulesList.locator("li.sidebar-placeholder", { hasText: "No scheduled SQL" }))
            .toBeVisible({ timeout: 10000 });

        // Click the "+" to add a new scheduled SQL -> navigates to the editor
        await sidebar.locator('button[aria-label="Add new scheduled SQL"]').click();

        await expect(page).toHaveURL(/\/schedules\/[^/]+\/[^/]+$/, { timeout: 15000 });
        await expect(page.getByRole("heading", { name: "Edit Scheduled SQL" })).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId("delete-schedule")).toBeVisible();

        // Go back to the project; the new scheduled SQL is now listed in the sidebar
        await page.goBack();

        const sidebar2 = await openSidebar(page);
        await expect(sidebar2.locator("#sidebar-schedules-list li a.schedule-link")).toHaveCount(1, { timeout: 10000 });

        // Clicking the listed entry navigates to the editor screen
        await sidebar2.locator("#sidebar-schedules-list li a.schedule-link").first().click();
        await expect(page).toHaveURL(/\/schedules\/[^/]+\/[^/]+$/, { timeout: 15000 });
        await expect(page.getByRole("heading", { name: "Edit Scheduled SQL" })).toBeVisible({ timeout: 15000 });
    });
});
