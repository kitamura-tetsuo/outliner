import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-91b8f20c
 *  Title   : Kanban placement lifecycle
 *  Source  : docs/client-features/kan-kanban-placement-lifecycle-91b8f20c.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { confirmSqlOnlyTableDeletion, readIndependentViews } from "../utils/sqlOnlyTableDeletionHelpers";
import { TestHelpers } from "../utils/testHelpers";

const objectRow = (page: Page, type: string) =>
    page.locator('[data-testid^="object-row-"]').filter({ has: page.locator(`.type-badge.${type}`) });

async function openObjects(page: Page) {
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible().catch(() => false)) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/);
}

async function createBoardOnPage(page: Page) {
    await openObjects(page);
    const table = objectRow(page, "table");
    await table.locator('[data-testid^="object-place-"]').click();
    await page.getByTestId("object-placement-confirm").click();
    const board = objectRow(page, "kanban");
    await expect(board).toHaveCount(1);
    return board;
}

test.describe("FTR-91b8f20c: Kanban production placement lifecycle", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard", ""]);
        await createBlankGrid(page, "Tasks", "tasks");
        await expect(page.getByTestId("yjs-table-view")).toBeVisible();
    });

    test("adds an existing board to Layout and moves that same placement out", async ({ page }) => {
        const board = await createBoardOnPage(page);
        const boardId = (await board.getAttribute("data-testid"))!.replace("object-row-", "");
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

        const nested = layout.getByTestId("kanban-board");
        await expect(nested).toHaveAttribute("data-kanban-id", boardId);
        const placementId = await nested.evaluate(node =>
            node.closest('[data-testid="layout-cell"]')?.getAttribute("data-item-id")
        );
        await nested.locator("xpath=ancestor::*[@data-testid='layout-cell']").getByTestId("layout-move-out").click();
        await expect(layout.getByTestId("kanban-board")).toHaveCount(0);
        await expect(page.locator(`[data-item-id="${placementId}"]`).getByTestId("kanban-board"))
            .toHaveAttribute("data-kanban-id", boardId);
        await expect(page.getByText("Dashboard", { exact: true })).toBeVisible();
    });

    test("cancels object deletion, then removes only the board and current placement", async ({ page }) => {
        const before = await readGridProjectState(page);
        const board = await createBoardOnPage(page);
        const boardId = (await board.getAttribute("data-testid"))!.replace("object-row-", "");
        await page.locator("aside [data-page-id]").first().click();
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
        const pageName = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1)!);
        await openObjects(page);
        await board.locator('[data-testid^="object-delete-"]').click();
        const confirmation = page.getByRole("alertdialog");
        await expect(confirmation).toContainText("2 Page placement");
        await confirmation.getByRole("button", { name: "Cancel" }).click();
        await expect(board).toHaveCount(1);

        await board.locator('[data-testid^="object-delete-"]').click();
        await confirmation.getByRole("button", { name: "Delete" }).click();
        await expect(board).toHaveCount(0);
        await expect(objectRow(page, "table")).toHaveCount(1);
        expect(await readGridProjectState(page)).toEqual(before);
        await page.locator("aside [data-page-id]").first().click();
        await expect(page).not.toHaveURL(/\/objects$/);
        for (const placementId of placementIds) {
            await expect(page.locator(`[data-item-id="${placementId}"]`)).toHaveCount(0);
        }
        await page.waitForTimeout(4000);
        await page.reload();
        await TestHelpers.waitForPageData(page, pageName, 30000);
        for (const placementId of placementIds) {
            await expect(page.locator(`[data-item-id="${placementId}"]`)).toHaveCount(0);
        }
        await expect(page.getByText("Dashboard", { exact: true })).toBeVisible();
    });

    test("preserves SQL-dependent Grid and Kanban definitions and placements after Table deletion", async ({ page }) => {
        await createBoardOnPage(page);
        const before = await readIndependentViews(page);
        const table = objectRow(page, "table");
        await table.locator('[data-testid^="object-open-"]').click();
        await page.getByRole("button", { name: "Delete table" }).click();
        await confirmSqlOnlyTableDeletion(page);
        expect(await readIndependentViews(page)).toEqual(before);
        await openObjects(page);
        await expect(objectRow(page, "table")).toHaveCount(0);
        await expect(objectRow(page, "grid")).toHaveCount(1);
        await expect(objectRow(page, "kanban")).toHaveCount(1);
        await expect(objectRow(page, "kanban").locator('[data-testid^="object-placement-"]')).toHaveCount(1);
    });
});
