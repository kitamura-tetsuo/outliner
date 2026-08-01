/** @feature TBL-b4e82a91 */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Table column visibility", () => {
    test("hides, persists, and restores a column in its original position", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table visibility"]);
        const item = page.locator(".outliner-item").first();
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();

        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible();
        await createPanel.getByTestId("yjs-table-preset-select").selectOption("tasks");
        await createPanel.getByTestId("yjs-table-create").click();

        let view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible();
        const originalColumns = await view.locator("th[data-col]").evaluateAll(headers =>
            headers.map(header => header.getAttribute("data-col"))
        );
        expect(originalColumns).toContain("priority");

        await view.getByTestId("yjs-table-toggle-ui").click();
        const hiddenCheckbox = view.getByTestId("yjs-table-hidden-priority");
        await expect(hiddenCheckbox).toHaveAccessibleName("Hidden");
        await hiddenCheckbox.check();
        await expect(view.locator("th[data-col='priority']")).toHaveCount(0);
        await expect(view.locator("td[data-col='priority']")).toHaveCount(0);

        await page.reload();
        view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible();
        await expect(view.locator("th[data-col='priority']")).toHaveCount(0);
        await view.getByTestId("yjs-table-toggle-ui").click();
        const persistedCheckbox = view.getByTestId("yjs-table-hidden-priority");
        await expect(persistedCheckbox).toBeChecked();

        await persistedCheckbox.uncheck();
        await expect(view.locator("th[data-col='priority']")).toBeVisible();
        const restoredColumns = await view.locator("th[data-col]").evaluateAll(headers =>
            headers.map(header => header.getAttribute("data-col"))
        );
        expect(restoredColumns).toEqual(originalColumns);
    });
});
