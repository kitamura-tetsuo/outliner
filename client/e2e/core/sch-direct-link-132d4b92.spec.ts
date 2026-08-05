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

        // Use a new context for a fresh session
        const freshContext = await page.context().browser()!.newContext();
        const freshPage = await freshContext.newPage();

        const scheduleUrl = `http://127.0.0.1:7090/${encodeURIComponent(projectName)}/${
            encodeURIComponent(pageName)
        }/schedule`;

        // Navigate directly to schedule
        await freshPage.goto(scheduleUrl, { waitUntil: "domcontentloaded" });

        // The URL should not leave the schedule route
        await freshPage.waitForTimeout(5000); // Give it time to attempt bounce
        expect(freshPage.url()).toContain("/schedule");

        // The list should show something (even if empty, it shouldn't show error)
        await expect(freshPage.getByTestId("schedule-list")).toBeVisible({ timeout: 15000 });
        await expect(freshPage.getByTestId("schedule-error")).not.toBeVisible();
    });
});
