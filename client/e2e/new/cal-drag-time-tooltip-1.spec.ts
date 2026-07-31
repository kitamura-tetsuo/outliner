import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Drag Tooltip", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Standup", "Another item"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            items.at(1).start = `${today}T09:00:00.000Z`;
            items.at(1).allDay = false;
            items.at(1).duration = "PT30M";
        });
    });

    test("shows tooltip with destination time while dragging and clears on drop", async ({ page }) => {
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
        await page.getByTestId("calendar-name-input").first().fill("Grid Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, all_day, start_at, duration, 'item' AS source_kind, id AS source_id "
                + "FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");

        await expect(page.getByTestId("calendar-time-grid").first()).toBeVisible({ timeout: 15000 });
        const entryCard = page.locator('[data-testid^="calendar-entry-item:"]').first();
        await expect(entryCard).toBeVisible({ timeout: 15000 });

        // Wait until no longer readonly
        await expect(entryCard).not.toHaveClass(/not-writable/, { timeout: 15000 });

        const tooltip = page.getByTestId("calendar-drag-tooltip");
        await expect(tooltip).not.toBeVisible();

        const cardBox = await entryCard.boundingBox();
        if (!cardBox) throw new Error("Card bounding box not found");

        const grid = page.getByTestId("calendar-time-grid").first();

        await entryCard.hover({ position: { x: 10, y: 10 } });
        await page.mouse.down();
        await expect(grid).toHaveClass(/dragging/);

        await page.mouse.move(cardBox.x + 20, cardBox.y + 100, { steps: 5 });

        await expect(tooltip).toBeVisible({ timeout: 5000 });
        const labelText = await tooltip.textContent();
        expect(labelText).toContain("–"); // Formatted time range

        await page.mouse.up();
        await expect(tooltip).not.toBeVisible();
    });
});
