import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-91b8f20c
 *  Title   : Kanban placement lifecycle
 *  Source  : docs/client-features/kan-kanban-placement-lifecycle-91b8f20c.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
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

test("FTR-91b8f20c: remove-direct-references deletes Page and Layout placement nodes", async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard", "Unaffected neighbour"]);
    await createBlankGrid(page, "Tasks", "tasks");
    await openObjects(page);
    await objectRow(page, "table").locator('[data-testid^="object-place-"]').click();
    await page.getByTestId("object-placement-confirm").click();
    const board = objectRow(page, "kanban");
    const boardId = (await board.getAttribute("data-testid"))!.replace("object-row-", "");

    await page.locator("aside [data-page-id]").first().click();
    await expect(page).not.toHaveURL(/\/objects$/);
    const pageName = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1)!);
    const layout = (await createBlockFromItem(
        page,
        page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Dashboard" }),
        "Layout",
    )).getByTestId("layout-block");
    await layout.click({ button: "right" });
    await page.getByTestId("layout-add-kanban").click();
    const placementDialog = page.getByTestId("layout-kanban-dialog");
    await placementDialog.getByLabel("Existing board").check();
    await placementDialog.locator("select").nth(1).selectOption(boardId);
    await placementDialog.getByTestId("layout-kanban-confirm").click();
    const placementIds = await page.locator(`[data-testid="kanban-board"][data-kanban-id="${boardId}"]`)
        .evaluateAll(nodes => nodes.map(node => node.closest("[data-item-id]")!.getAttribute("data-item-id")));

    await openObjects(page);
    await objectRow(page, "table").locator('[data-testid^="object-open-"]').click();
    await page.getByRole("button", { name: "Delete table" }).click();
    await page.getByRole("dialog", { name: /Delete table/ })
        .getByRole("button", { name: "Delete table and remove direct references" }).click();
    await openObjects(page);
    await expect(objectRow(page, "table")).toHaveCount(0);
    await expect(objectRow(page, "kanban")).toHaveCount(0);

    await page.locator("aside [data-page-id]").first().click();
    await expect(page).not.toHaveURL(/\/objects$/);
    for (const placementId of placementIds) {
        await expect(page.locator(`[data-item-id="${placementId}"]`)).toHaveCount(0);
    }
    await expect(page.getByText("Unaffected neighbour", { exact: true })).toBeVisible();
    await page.waitForTimeout(4000);
    await page.reload();
    await TestHelpers.waitForPageData(page, pageName, 30000);
    for (const placementId of placementIds) {
        await expect(page.locator(`[data-item-id="${placementId}"]`)).toHaveCount(0);
    }
    await expect(page.getByText("Unaffected neighbour", { exact: true })).toBeVisible();
});
