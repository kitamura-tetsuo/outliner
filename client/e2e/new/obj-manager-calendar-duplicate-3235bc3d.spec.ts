import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Duplicating a Calendar rewrites its query to the copied Table
 *  Source  : docs/client-features/obj-project-object-manager-8ac92ce2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-8ac92ce2: recursive duplication supports Calendar", () => {
    test(
        "duplicating a Calendar with a connected Table copies both and rewrites the query",
        async ({ page }, testInfo) => {
            test.setTimeout(180000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
            await createBlankGrid(page, "Dup Board", "dup_board");

            const item = page.locator(".outliner-item[data-item-id]").first();
            const block = await createBlockFromItem(page, item, "Calendar");
            const createPanel = block.getByTestId("calendar-create-panel");
            await expect(createPanel).toBeVisible({ timeout: 10000 });
            await createPanel.getByTestId("calendar-name-input").fill("Dup Calendar");
            await createPanel.getByTestId("calendar-create").click();
            const view = block.getByTestId("calendar-view");
            await expect(view).toBeVisible({ timeout: 20000 });
            const queryInput = view.getByTestId("calendar-query-input");
            await queryInput.fill("SELECT id, title FROM dup_board");
            await queryInput.blur();
            await expect(view.getByTestId("calendar-query-error")).toHaveCount(0, { timeout: 20000 });

            const projectName = decodeURIComponent(new URL(page.url()).pathname.split("/")[1]);

            await page.goto(`/calendars/${encodeURIComponent(projectName)}/${encodeURIComponent("Dup Calendar")}`);
            const standaloneView = page.getByTestId("calendar-view");
            await expect(standaloneView).toBeVisible({ timeout: 20000 });
            // The settings panel (which hosts the query input) starts collapsed
            // once a Calendar already has a non-empty query.
            await page.getByTestId("calendar-toggle-settings").click();
            const standaloneQueryInput = page.getByTestId("calendar-query-input");
            await expect(standaloneQueryInput).toHaveValue("SELECT id, title FROM dup_board", { timeout: 20000 });

            await page.getByTestId("calendar-duplicate-button").click();
            const dialog = page.getByTestId("object-duplication-dialog");
            await expect(dialog).toBeVisible();
            await dialog.getByLabel("Duplication scope").selectOption("referenced");
            await expect(dialog).toContainText("2 objects will be duplicated");
            await dialog.getByRole("button", { name: "Duplicate" }).click();

            await expect(page).toHaveURL(/\/calendars\/[^/]+\/[0-9a-f-]+$/, { timeout: 20000 });
            await expect(page.getByTestId("calendar-view")).toBeVisible({ timeout: 20000 });
            await page.getByTestId("calendar-toggle-settings").click();
            const copiedQueryInput = page.getByTestId("calendar-query-input");
            // The source query's columns were unqualified, so only the FROM
            // relation name is rewritten (the SQL-name remapping rewrites
            // relation identifiers, not unqualified column references).
            await expect(copiedQueryInput).toHaveValue("SELECT id, title FROM dup_board_2", { timeout: 20000 });

            const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
            if (!await sidebar.isVisible().catch(() => false)) {
                await page.locator('button[aria-label="Show sidebar"]').click();
            }
            await sidebar.getByRole("link", { name: "Object Manager" }).click();
            await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });
            await expect(
                page.locator('[data-testid^="object-row-"]').filter({ hasText: "Dup Board" }).filter({
                    has: page.locator(".type-badge.table"),
                }),
            ).toHaveCount(2);
            await expect(
                page.locator('[data-testid^="object-row-"]').filter({ hasText: "Dup Calendar" }).filter({
                    has: page.locator(".type-badge.calendar"),
                }),
            ).toHaveCount(2);
        },
    );
});
