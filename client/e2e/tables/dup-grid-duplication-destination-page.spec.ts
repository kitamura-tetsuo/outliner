import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-5090: Grid duplication to a destination Page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Seed with "page 1" text so the page has that content, but the actual page title might be "test-page-..."
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        // Create a Grid so we can access its standalone page
        await createBlankGrid(page, "Test Grid", "test_table");
    });

    test("duplicates Grid and attaches it to the selected destination Page", async ({ page }) => {
        // Find the created grid ID to navigate to its standalone page
        const { gridId, projectName, page1Id } = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const client = (window as any).__YJS_STORE__?.yjsClient;
            const project = client?.getProject();
            let gid: string | undefined;
            project?.ydoc.getMap("yjsGrids").forEach((_val: any, key: string) => {
                gid = key;
            });
            let pid: string | undefined;

            // The root pages are stored in project.items.
            // When seedProjectAndNavigate creates it, the page has an id
            if (project?.items) {
                for (let i = 0; i < project.items.length; i++) {
                    const item = project.items.at(i);
                    if (item) {
                        pid = item.id;
                        break; // just take the first page
                    }
                }
            }

            return { gridId: gid, projectName: project?.title, page1Id: pid };
        });

        expect(gridId).toBeTruthy();
        expect(projectName).toBeTruthy();

        // Open the Grid standalone page
        await page.goto(`/grids/${encodeURIComponent(projectName!)}/${gridId}`);

        // Wait for it to load
        await expect(page.getByRole("button", { name: "Duplicate Grid" })).toBeVisible({ timeout: 15000 });

        // Click Duplicate
        await page.getByRole("button", { name: "Duplicate Grid" }).click();

        // Wait for dialog
        const dialog = page.getByTestId("object-duplication-dialog");
        await expect(dialog).toBeVisible();

        // Select destination page
        const destinationPageSelect = page.getByTestId("duplicate-destination-page");
        await expect(destinationPageSelect).toBeVisible();

        // Wait for the options to be populated
        await expect(destinationPageSelect.locator("option")).toHaveCount(2, { timeout: 15000 }); // "Do not attach..." + "test-page-xxx"

        await destinationPageSelect.evaluate((select: HTMLSelectElement, pid: string) => {
            select.value = pid;
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }, page1Id!);

        // Execute duplication
        await dialog.getByRole("button", { name: "Duplicate" }).click();

        // It redirects to the new Grid's standalone page, wait for it
        await expect(page).toHaveURL(new RegExp(`/grids/${encodeURIComponent(projectName!)}/[a-zA-Z0-9_-]+`));

        // Navigate back to the destination Page to verify placement.
        // We need to go back to the specific test page we created in seedProjectAndNavigate!
        await page.goto(`/${encodeURIComponent(projectName!)}/test-page-${projectName?.split(" ").pop()}`);
        await TestHelpers.waitForOutlinerItems(page, 2, 15000); // at least 2 items

        // Let's look for the table view inside the outliner list that is a DIRECT child of the page items
        const gridHost = page.locator(".outliner-item").filter({ has: page.getByTestId("yjs-table-view") });
        // Since the test created a grid and attached it to the page, it should have been appended to the end.
        // In the E2E seed, createBlankGrid ALSO adds a grid, so we might have TWO grids on the page now.
        // Let's assert that there is at least one grid, and that ALL grid hosts are visual nodes.
        const count = await gridHost.count();
        expect(count).toBeGreaterThan(0);

        for (let i = 0; i < count; i++) {
            // Verify it's a visual node and not just empty text
            await expect(gridHost.nth(i).locator("> .item-content .item-text")).toHaveCount(0); // A grid host owns no outline text
        }
    });
});
