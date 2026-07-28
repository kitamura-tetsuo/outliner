import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-ac999163
 *  Title   : INSERT destination picker and DELETE prompt for the calendar
 *  Source  : docs/client-features/cal-insert-destination-picker-and-delete-prompt-ac999163.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-ac999163: creating a calendar entry always requires an explicit destination", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar item"]);
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
        await page.getByTestId("calendar-name-input").first().fill("Destination Calendar");
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

    test("cancelling the new-entry dialog creates nothing", async ({ page }) => {
        await attachWritableCalendar(page);

        await page.getByTestId("calendar-new-entry").first().click();
        const dialog = page.getByTestId("calendar-create-dialog").first();
        await expect(dialog).toBeVisible({ timeout: 10000 });

        await page.getByTestId("calendar-create-title-input").first().fill("Should not be created");
        await page.getByTestId("calendar-create-cancel").first().click();
        await expect(dialog).toHaveCount(0);

        // Nothing new appears in the outline: still just the page title + seeded item.
        await expect(page.locator(".outliner-item")).toHaveCount(2);
    });

    test("choosing a destination creates the item there, and offers it back as Recent next time", async ({ page }) => {
        await attachWritableCalendar(page);

        await page.getByTestId("calendar-new-entry").first().click();
        const dialog = page.getByTestId("calendar-create-dialog").first();
        await expect(dialog).toBeVisible({ timeout: 10000 });

        // Create is disabled until a destination is chosen.
        const submit = page.getByTestId("calendar-create-submit").first();
        await expect(submit).toBeDisabled();

        await page.getByTestId("calendar-create-title-input").first().fill("Plan the launch");
        const destinationSelect = page.getByTestId("calendar-create-destination-select").first();
        await expect
            .poll(async () => destinationSelect.locator("option").count(), { timeout: 15000 })
            .toBeGreaterThan(1);
        // Pick the first real page option (index 0 is the disabled placeholder).
        const firstPageValue = await destinationSelect.locator("option").nth(1).getAttribute("value");
        await destinationSelect.selectOption(firstPageValue!);
        await expect(submit).toBeEnabled();

        await submit.click();
        await expect(dialog).toHaveCount(0, { timeout: 10000 });

        // The new item now exists in the outline.
        await expect(page.locator(".outliner-item", { hasText: "Plan the launch" })).toBeVisible({ timeout: 15000 });

        // Reopening the dialog offers the just-used destination as Recent.
        await page.getByTestId("calendar-new-entry").first().click();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-testid^="calendar-create-destination-recent-"]').first())
            .toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-create-cancel").first().click();
    });
});
