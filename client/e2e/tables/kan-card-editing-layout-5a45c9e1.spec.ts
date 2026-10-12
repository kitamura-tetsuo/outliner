/** @feature KAN-5a45c9e1 */
import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    createSourceThroughUi,
    openKanbanList,
    TASK_QUERY,
} from "../utils/kanbanTestHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("Page/Layout card controls and pointer drag update Grid, peer, and reload without moving blocks", async ({
    page,
    context,
}, info) => {
    test.setTimeout(180000);
    const fixture = await createSourceThroughUi(page, info);
    await openKanbanList(page, fixture.projectName);
    const boardId = await createKanbanThroughUi(page, "Layout editing board", fixture.tableId);
    await configureKanbanThroughUi(page, {
        query: TASK_QUERY,
        group: "status",
        title: "title",
        details: ["detail"],
    });

    const showSidebar = page.getByRole("button", { name: "Show sidebar" });
    if (await showSidebar.isVisible().catch(() => false)) await showSidebar.click();
    const sourcePage = page.locator("aside [data-page-id]").first();
    await expect(sourcePage).toBeVisible();
    await sourcePage.click();
    const layoutRow = await createBlockFromItem(
        page,
        page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Kanban fixture" }),
        "Layout",
    );
    const layout = layoutRow.getByTestId("layout-block");
    await layout.click({ button: "right" });
    await page.getByTestId("layout-add-kanban").click();
    const dialog = page.getByTestId("layout-kanban-dialog");
    await dialog.getByLabel("Existing board").check();
    await dialog.locator("select").nth(1).selectOption(boardId);
    await dialog.getByTestId("layout-kanban-confirm").click();

    const board = layout.locator(`[data-testid="kanban-board"][data-kanban-id="${boardId}"]`);
    await expect(board).toBeVisible();
    const before = await layout.locator('[data-testid="layout-cell"]').evaluateAll(cells =>
        cells.map(cell => ({ id: cell.getAttribute("data-item-id"), style: cell.getAttribute("style") }))
    );
    const alpha = board.locator("article.card").filter({ hasText: "Alpha" });
    await alpha.getByRole("button", { name: "Edit title" }).click();
    // Opening the editor removes the title text used by `alpha`'s filter, so
    // reacquire the controls from the stable board boundary.
    const titleEditor = board.getByRole("textbox", { name: "Edit title" });
    await expect(titleEditor).toBeVisible();
    await titleEditor.fill("Alpha in layout");
    await board.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("yjs-table-view").getByText("Alpha in layout", { exact: true })).toBeVisible();

    const movedCard = board.locator("article.card").filter({ hasText: "Alpha in layout" });
    const target = board.locator('section.lane[data-lane-kind="string"]').filter({ hasText: "done" });
    const from = await movedCard.getByRole("button", { name: "Move card" }).boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("Kanban pointer targets are unavailable");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 });
    await page.mouse.up();
    await expect(target.locator("article.card").filter({ hasText: "Alpha in layout" })).toBeVisible();

    const source = (await readGridProjectState(page)).tables.find(table => table.id === fixture.tableId)!;
    expect(source.data[fixture.recordIds[0]]).toMatchObject({ title: "Alpha in layout", status: "done" });
    expect(
        await layout.locator('[data-testid="layout-cell"]').evaluateAll(cells =>
            cells.map(cell => ({ id: cell.getAttribute("data-item-id"), style: cell.getAttribute("style") }))
        ),
    ).toEqual(before);

    const peer = await context.newPage();
    await peer.goto(page.url());
    await expect(peer.locator(`[data-kanban-id="${boardId}"]`).getByText("Alpha in layout", { exact: true }))
        .toBeVisible({ timeout: 30000 });
    await page.reload();
    await expect(page.locator(`[data-kanban-id="${boardId}"]`).getByText("Alpha in layout", { exact: true }))
        .toBeVisible({ timeout: 30000 });
});
