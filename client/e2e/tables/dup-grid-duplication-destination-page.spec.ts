import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-5090: Grid duplication to a destination Page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Test Grid", "test_table");
    });

    test("duplicates Grid and attaches it to the selected destination Page", async ({ page }) => {
        const { gridId, projectName, page1Id } = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const client = (window as any).__YJS_STORE__?.yjsClient;
            const project = client?.getProject();
            let gid: string | undefined;
            project?.ydoc.getMap("yjsGrids").forEach((_val: any, key: string) => {
                gid = key;
            });
            let pid: string | undefined;

            if (project?.items) {
                for (let i = 0; i < project.items.length; i++) {
                    const item = project.items.at(i);
                    if (item) {
                        pid = item.id;
                        break;
                    }
                }
            }

            return { gridId: gid, projectName: project?.title, page1Id: pid };
        });

        expect(gridId).toBeTruthy();
        expect(projectName).toBeTruthy();

        await page.goto(`/grids/${encodeURIComponent(projectName!)}/${gridId}`);

        await expect(page.getByRole("button", { name: "Duplicate Grid" })).toBeVisible({ timeout: 15000 });

        await page.getByRole("button", { name: "Duplicate Grid" }).click();

        const dialog = page.getByTestId("object-duplication-dialog");
        await expect(dialog).toBeVisible();

        const destinationPageSelect = page.getByTestId("duplicate-destination-page");
        await expect(destinationPageSelect).toBeVisible();

        await expect(destinationPageSelect.locator("option")).toHaveCount(2, { timeout: 15000 });

        await destinationPageSelect.evaluate((select: HTMLSelectElement, pid: string) => {
            select.value = pid;
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }, page1Id!);

        await dialog.getByRole("button", { name: "Duplicate" }).click();

        await expect(page).toHaveURL(new RegExp(`/grids/${encodeURIComponent(projectName!)}/[a-zA-Z0-9_-]+`));

        await page.goto(`/${encodeURIComponent(projectName!)}/test-page-${projectName?.split(" ").pop()}`);

        // Wait for items to be visible, wait specifically for the grid view.
        // We use .first() because createBlankGrid and the duplication both attach grids to the page.
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 30000 });

        const gridHost = page.locator(".outliner-item").filter({ has: page.getByTestId("yjs-table-view") });
        const count = await gridHost.count();
        expect(count).toBeGreaterThan(0);

        for (let i = 0; i < count; i++) {
            await expect(gridHost.nth(i).locator("> .item-content .item-text")).toHaveCount(0);
        }
    });
});
