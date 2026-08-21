import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

/** @feature FTR-9ce96e44 */
test("sticky day/weekday headers in calendar views", async ({ page, context }, testInfo) => {
    // Force a specific timezone so dates align predictability across CI environments
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Using a seeded project to bypass typing tests
    const _p = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["item 1", "item 2"]);

    // Type a calendar
    const item = page.locator(".outliner-item").nth(1);
    // Node kinds are immutable (#5015): the block is created by the
    // slash command, not by converting this row.
    await createBlockFromItem(page, item, "Calendar");

    const createPanel = page.getByTestId("calendar-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await page.getByTestId("calendar-name-input").first().fill("Week Calendar");
    await page.getByTestId("calendar-create").first().click();

    // Verify view is created
    const view = page.getByTestId("calendar-view").first();
    await expect(view).toBeVisible({ timeout: 15000 });

    const activeTimezone = page.getByTestId("calendar-active-timezone").first();
    await expect(activeTimezone).toBeVisible({ timeout: 15000 });

    const timezoneSelect = page.getByTestId("calendar-timezone-select").first();
    await timezoneSelect.selectOption("Asia/Tokyo");
    await expect(activeTimezone).toHaveText("Asia/Tokyo");

    // Give it a moment to load
    await page.waitForTimeout(500);

    // Week is default view type, no need to click toolbar buttons

    // Assert there is a header row in the main time grid
    const headerRow = page.getByTestId("calendar-day-header-row").first();
    await expect(headerRow).toBeVisible();

    // Verify 7 day headers for the week view
    for (let i = 0; i < 7; i++) {
        const header = page.getByTestId(`calendar-day-header-${i}`).first();
        await expect(header).toBeVisible();
    }

    const day0 = page.getByTestId("calendar-day-header-0").first();
    const day6 = page.getByTestId("calendar-day-header-6").first();

    // Scroll the time grid vertically
    const scrollArea = page.getByTestId("calendar-time-grid-scroll").first();

    // Evaluate to scroll down
    await scrollArea.evaluate((node) => {
        node.scrollTop = 200;
    });

    await page.waitForTimeout(100);

    // Ensure headers are still visible and haven't scrolled away
    await expect(day0).toBeVisible();
    await expect(day6).toBeVisible();
});
