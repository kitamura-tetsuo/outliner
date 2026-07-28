import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5c06604d
 *  Title   : Calendar model and UI Definition: registry, query, and role assignment
 *  Source  : docs/client-features/cal-calendar-model-and-role-assignment-5c06604d.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-5c06604d: calendar registry, query, and role assignment", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar demo item"]);
    });

    test("attaches a calendar to an item, runs a query, and assigns roles", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();
        await page.waitForTimeout(300);

        // Attach a calendar via the item's context menu.
        await item.click({ button: "right" });
        await page.getByRole("menuitem", { name: "Change to Calendar" }).click();

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("My Calendar");
        await page.getByTestId("calendar-create").first().click();

        // The view mounts (PGlite loads lazily, so allow generous time).
        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId("calendar-name").first()).toHaveText("My Calendar");

        // A query missing source_kind/source_id is read-only, and says so.
        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill("SELECT id, text AS title, due FROM outline_items");
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner").first()).toBeVisible({ timeout: 15000 });

        // Adding source_kind/source_id makes it editable and the read-only
        // banner disappears; the role editor lists the new result columns.
        await queryInput.fill(
            "SELECT id, text AS title, due, 'item' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        const titleRoleSelect = page.getByTestId("calendar-role-roleTitle").first();
        await expect(titleRoleSelect.locator("option", { hasText: "title" })).toBeVisible({ timeout: 15000 });
        await titleRoleSelect.selectOption("title");
        await expect(titleRoleSelect).toHaveValue("title");

        // The role assignment is a Yjs write: reload and confirm it persisted.
        await page.reload();
        await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId("calendar-role-roleTitle").first()).toHaveValue("title", { timeout: 15000 });
    });
});
