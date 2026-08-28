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

async function findCalendarIdByName(page: import("@playwright/test").Page, name: string): Promise<string | undefined> {
    return page.evaluate((calendarName) => {
        // eslint-disable-next-line no-restricted-globals
        const client = (window as any).__YJS_STORE__?.yjsClient;
        const project = client?.getProject();
        let found: string | undefined;
        project?.calendars?.forEach((value: any, key: string) => {
            if (value.get("name") === calendarName) found = key;
        });
        return found;
    }, name);
}

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

            await page.goto(`/${encodeURIComponent(projectName)}/-/calendars/${encodeURIComponent("Dup Calendar")}`);
            const standaloneView = page.getByTestId("calendar-view");
            await expect(standaloneView).toBeVisible({ timeout: 20000 });
            // The settings panel (which hosts the query input) starts collapsed
            // once a Calendar already has a non-empty query.
            await page.getByTestId("calendar-toggle-settings").click();
            const standaloneQueryInput = page.getByTestId("calendar-query-input");
            await expect(standaloneQueryInput).toHaveValue("SELECT id, title FROM dup_board", { timeout: 20000 });

            // Duplicate opens Object Manager with the Calendar preselected
            // (#5153 §10) instead of the old per-object recursive scope
            // chooser. `Select related → Dependencies` pulls in the Table it
            // reads, matching the old "referenced" scope's object set.
            await page.getByTestId("calendar-duplicate-button").click();
            await expect(page).toHaveURL(/\/objects\?selected=/, { timeout: 15000 });
            const calendarRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Dup Calendar" })
                .filter({ has: page.locator(".type-badge.calendar") });
            await expect(calendarRow).toBeVisible({ timeout: 15000 });
            await expect(calendarRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();

            await page.getByTestId("object-manager-select-related").click();
            await page.getByTestId("object-manager-select-related-dependencies").click();
            await expect(page.getByTestId("object-manager-selected-count")).toHaveText("2 selected");

            await page.getByTestId("object-manager-duplicate-selected").click();
            const dialog = page.getByTestId("object-manager-duplicate-dialog");
            await expect(dialog).toBeVisible();
            await expect(dialog).toContainText("2 objects will be duplicated");
            await dialog.getByTestId("object-manager-duplicate-apply").click();
            await expect(dialog).toBeHidden({ timeout: 20000 });

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

            // The copied Calendar's query was rewritten to the copied Table's
            // SQL name, not left pointing at the original.
            const copiedCalendarId = await findCalendarIdByName(page, "Dup Calendar copy");
            expect(copiedCalendarId).toBeTruthy();
            await page.goto(`/${encodeURIComponent(projectName)}/-/calendars/${copiedCalendarId}`);
            await expect(page.getByTestId("calendar-view")).toBeVisible({ timeout: 20000 });
            await page.getByTestId("calendar-toggle-settings").click();
            const copiedQueryInput = page.getByTestId("calendar-query-input");
            // The source query's columns were unqualified, so only the FROM
            // relation name is rewritten (the SQL-name remapping rewrites
            // relation identifiers, not unqualified column references).
            await expect(copiedQueryInput).toHaveValue("SELECT id, title FROM dup_board_2", { timeout: 20000 });
        },
    );
});
