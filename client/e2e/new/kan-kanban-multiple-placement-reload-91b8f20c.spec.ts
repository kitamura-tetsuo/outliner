import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-91b8f20c
 *  Title   : Kanban placement lifecycle
 *  Source  : docs/client-features/kan-kanban-placement-lifecycle-91b8f20c.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

const objectRow = (page: Page, type: string) =>
    page.locator('[data-testid^="object-row-"]').filter({ has: page.locator(`.type-badge.${type}`) });

async function openObjects(page: Page) {
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible().catch(() => false)) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/);
}

test.describe("FTR-91b8f20c: synchronized multiple Kanban placements", () => {
    test("preserves registry, reference graph, records, and neighbours across reload", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard", "Text neighbour"]);
        await createBlankGrid(page, "Tasks", "tasks");
        const recordsBefore = await readGridProjectState(page);
        await openObjects(page);

        const table = objectRow(page, "table");
        await table.locator('[data-testid^="object-place-"]').click();
        await page.getByTestId("object-placement-confirm").click();
        const board = objectRow(page, "kanban");
        const boardId = (await board.getAttribute("data-testid"))!.replace("object-row-", "");
        await expect(board.locator('[data-testid^="object-placement-"]')).toHaveCount(1);

        await page.locator("aside [data-page-id]").first().click();
        const layoutRow = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Dashboard" }),
            "Layout",
        );
        const layout = layoutRow.getByTestId("layout-block");
        await layout.click({ button: "right" });
        await page.getByTestId("layout-add-kanban").click();
        const dialog = page.getByTestId("layout-kanban-dialog");
        await dialog.getByLabel("Existing board").check();
        await dialog.locator("select").nth(1).selectOption(boardId);
        await dialog.getByTestId("layout-kanban-confirm").click();
        await expect(page.locator(`[data-testid="kanban-board"][data-kanban-id="${boardId}"]`)).toHaveCount(2);
        await expect(page.getByText("Text neighbour", { exact: true })).toBeVisible();

        // Allow the normal debounced persistence path to publish the coherent project update.
        await page.waitForTimeout(4000);
        await page.reload();
        await page.waitForFunction(() => (globalThis as any).__YJS_STORE__?.isConnected, undefined, { timeout: 30000 });
        await openObjects(page);

        await expect(objectRow(page, "kanban")).toHaveCount(1);
        await expect(objectRow(page, "kanban").locator('[data-testid^="object-placement-"]')).toHaveCount(2);
        await expect(objectRow(page, "table")).toHaveCount(1);
        await expect(objectRow(page, "grid")).toHaveCount(1);
        expect(await readGridProjectState(page)).toEqual(recordsBefore);
    });
});
