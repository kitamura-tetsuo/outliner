import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-ac999163
 *  Title   : INSERT destination picker and DELETE prompt for the calendar
 *  Source  : docs/client-features/cal-insert-destination-picker-and-delete-prompt-ac999163.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-ac999163: deleting a calendar entry always prompts for the disposition", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Standup", "Retro"]);
    });

    async function attachWritableCalendar(page: import("@playwright/test").Page) {
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
        await page.getByTestId("calendar-name-input").first().fill("Delete Prompt Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, all_day, start_on, "
                + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });
    }

    async function createEntry(page: import("@playwright/test").Page, title: string) {
        await page.getByTestId("calendar-new-entry").first().click();
        const dialog = page.getByTestId("calendar-create-dialog").first();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-create-title-input").first().fill(title);
        const destinationSelect = page.getByTestId("calendar-create-destination-select").first();
        await expect
            .poll(async () => destinationSelect.locator("option").count(), { timeout: 15000 })
            .toBeGreaterThan(1);
        const firstPageValue = await destinationSelect.locator("option").nth(1).getAttribute("value");
        await destinationSelect.selectOption(firstPageValue!);
        await page.getByTestId("calendar-create-submit").first().click();
        await expect(dialog).toHaveCount(0, { timeout: 10000 });
        await expect(page.locator(".outliner-item", { hasText: title })).toBeVisible({ timeout: 15000 });
    }

    test("clearing the date keeps the item but removes it from the calendar", async ({ page }) => {
        await attachWritableCalendar(page);
        await createEntry(page, "Keep me, clear my date");

        const entryChip = page.locator('[data-testid^="calendar-entry-outline_items:"]', {
            hasText: "Keep me, clear my date",
        }).first();
        await expect(entryChip).toBeVisible({ timeout: 15000 });

        const deleteButton = entryChip.locator('[data-testid^="calendar-entry-delete-"]');
        await deleteButton.click();
        const dialog = page.getByTestId("calendar-delete-dialog").first();
        await expect(dialog).toBeVisible({ timeout: 10000 });

        await page.getByTestId("calendar-delete-clear-field").first().click();
        await expect(dialog).toHaveCount(0, { timeout: 10000 });

        // The card leaves the calendar...
        await expect(page.locator('[data-testid^="calendar-entry-outline_items:"]', {
            hasText: "Keep me, clear my date",
        })).toHaveCount(0, { timeout: 15000 });
        // ...but the item itself survives in the outline.
        await expect(page.locator(".outliner-item", { hasText: "Keep me, clear my date" })).toBeVisible();
    });

    test("deleting the item removes it from both the calendar and the outline", async ({ page }) => {
        await attachWritableCalendar(page);
        await createEntry(page, "Delete me entirely");

        const entryChip = page.locator('[data-testid^="calendar-entry-outline_items:"]', {
            hasText: "Delete me entirely",
        }).first();
        await expect(entryChip).toBeVisible({ timeout: 15000 });

        const deleteButton = entryChip.locator('[data-testid^="calendar-entry-delete-"]');
        await deleteButton.click();
        const dialog = page.getByTestId("calendar-delete-dialog").first();
        await expect(dialog).toBeVisible({ timeout: 10000 });

        await page.getByTestId("calendar-delete-source").first().click();
        await expect(dialog).toHaveCount(0, { timeout: 10000 });

        await expect(page.locator(".outliner-item", { hasText: "Delete me entirely" })).toHaveCount(0, {
            timeout: 15000,
        });
    });
});
