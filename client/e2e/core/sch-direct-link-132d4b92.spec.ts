import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("SCH-132D4B92: Schedule Direct Link E2E", () => {
    test("schedule page loads without bouncing to parent page", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Line 1",
            "Line 2",
        ]);

        // Wait for connection to settle
        await page.waitForTimeout(2000);

        // We will just navigate to the schedule url directly using the established test context
        // to avoid tricky unauthenticated states
        const scheduleUrl = `http://127.0.0.1:7090/${encodeURIComponent(projectName)}/${
            encodeURIComponent(pageName)
        }/schedule`;

        // Clear session storage and store manually to test from a somewhat clean state
        // but within the already seeded context
        await page.evaluate(() => {
            if (globalThis.sessionStorage) {
               globalThis.sessionStorage.clear();
            }
        });

        // Navigate directly to schedule
        await page.goto(scheduleUrl, { waitUntil: "domcontentloaded" });

        // The URL should not leave the schedule route
        await page.waitForTimeout(5000); // Give it time to attempt bounce
        expect(page.url()).toContain("/schedule");

        // Wait for the UI components
        await expect(page.locator("body")).toContainText("Schedule Management", { timeout: 15000 });

        // Ensure there is no error indicating a failure to find the pageId
        await expect(page.getByTestId("schedule-error")).not.toBeVisible();
    });
});
