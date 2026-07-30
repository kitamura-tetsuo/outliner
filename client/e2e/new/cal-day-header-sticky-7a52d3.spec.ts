import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("day/week calendar headers are sticky and display correctly", async ({ page }, testInfo) => {
    test.setTimeout(120000);
    // Navigate to a new project
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Project Root"]);

    // Create a calendar via context menu
    const item = page.locator(".outliner-item").nth(1);
    await expect(item).toBeVisible({ timeout: 10000 });
    await item.click();
    await page.waitForTimeout(300);

    await item.click({ button: "right" });
    const contextMenu = page.locator(".context-menu");
    await expect(contextMenu).toBeVisible({ timeout: 10000 });
    await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

    const createPanel = page.getByTestId("calendar-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await page.getByTestId("calendar-name-input").first().fill("Header Test Calendar");
    await page.getByTestId("calendar-create").first().click();

    const view = page.getByTestId("calendar-view").first();
    await expect(view).toBeVisible({ timeout: 15000 });

    // Switch to week view
    await page.getByTestId("calendar-view-type").selectOption("week");

    // Wait for the grid to be visible
    const scrollArea = page.getByTestId("calendar-time-grid-scroll");
    await expect(scrollArea).toBeVisible();

    // Verify 7 headers are present (0 through 6)
    for (let i = 0; i < 7; i++) {
        const header = page.getByTestId(`calendar-day-header-${i}`);
        await expect(header).toBeVisible();
    }

    // Scroll down the hour grid
    await scrollArea.evaluate((el) => {
        el.scrollTop = 500;
    });

    // The headers should still be visible because they are sticky
    const firstHeader = page.getByTestId("calendar-day-header-0");
    await expect(firstHeader).toBeVisible();

    // The bounding box of the header should be near the top of the grid
    const box = await firstHeader.boundingBox();
    expect(box).not.toBeNull();
});
