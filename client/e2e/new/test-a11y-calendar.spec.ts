import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Calendar view type select has accessible name", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar demo item"]);
    });

    test("calendar view-type select has an accessible name", async ({ page }) => {
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
        await page.getByTestId("calendar-name-input").first().fill("My Accessibility Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        // Ensure the combobox is found by its accessible name
        const combobox = page.getByRole("combobox", { name: /My Accessibility Calendar view/i });
        await expect(combobox).toBeVisible({ timeout: 15000 });
    });

    test("calendar resize handle is keyboard accessible", async ({ page }) => {
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
        await page.getByTestId("calendar-name-input").first().fill("Resize Keyboard Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, all_day, start_at, duration, 'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");

        // Ensure we seed an item with a start/duration
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const target = items.at(1) ?? items.at(0); // fallback if only 1 item exists
            if (!target) throw new Error("No items found");
            const today = new Date().toISOString().slice(0, 10);
            target.start = `${today}T09:00:00.000Z`;
            target.allDay = false;
            target.duration = "PT30M";
            return String(target.id);
        });

        // Use the Day view
        const combobox = page.getByRole("combobox", { name: /Resize Keyboard Calendar view/i });
        await combobox.selectOption("day");

        // Wait for grid to load and resize handle to appear
        await expect(page.getByTestId("calendar-time-grid").first()).toBeVisible({ timeout: 15000 });
        const entry = page.locator('.timed-entry').first();
        await expect(entry).toBeVisible({ timeout: 15000 });
        await expect(entry).not.toHaveClass(/not-writable/, { timeout: 15000 });

        const handle = entry.locator('.resize-handle').first();
        await expect(handle).toBeVisible({ timeout: 15000 });

        // Check initial aria attributes
        await expect(handle).toHaveAttribute("aria-valuenow", "30");
        await expect(handle).toHaveAttribute("aria-valuetext", "30m");

        // Focus the resize handle
        await handle.focus();

        // Press ArrowDown to resize (+15 mins)
        await page.keyboard.press("ArrowDown");
        await expect(handle).toHaveAttribute("aria-valuenow", "45", { timeout: 10000 });
        await expect(handle).toHaveAttribute("aria-valuetext", "45m");

        // Press ArrowUp to resize back (-15 mins)
        await page.keyboard.press("ArrowUp");
        await expect(handle).toHaveAttribute("aria-valuenow", "30", { timeout: 10000 });
    });
});
