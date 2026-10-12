/** @feature KAN-5a45c9e1 */
import { expect, type Locator, type Page, test } from "@playwright/test";
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

async function dragCardToLane(
    page: Page,
    handle: Locator,
    lane: Locator,
) {
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await handle.dispatchEvent("dragstart", { dataTransfer: transfer });
    await lane.dispatchEvent("dragover", { dataTransfer: transfer });
    await lane.dispatchEvent("drop", { dataTransfer: transfer });
    await handle.dispatchEvent("dragend", { dataTransfer: transfer }).catch(() => {});
}

test("Page/Layout card drag and draft survive host capture and an unrelated peer refresh", async ({
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
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    const boardObject = page.getByTestId(`object-row-${boardId}`);
    await boardObject.locator('[data-testid^="object-place-"]').click();
    await page.getByTestId("object-placement-confirm").click();

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
    const pageBoard = page.locator(`.outliner-item[data-node-kind="kanban"] [data-kanban-id="${boardId}"]`);
    await expect(pageBoard).toBeVisible();
    const before = await layout.locator('[data-testid="layout-cell"]').evaluateAll(cells =>
        cells.map(cell => ({ id: cell.getAttribute("data-item-id"), style: cell.getAttribute("style") }))
    );

    const pageAlpha = pageBoard.locator("article.card").filter({ hasText: "Alpha" });
    const pageDone = pageBoard.locator('section.lane[data-lane-kind="string"]').filter({ hasText: "done" });
    await dragCardToLane(page, pageAlpha.getByRole("button", { name: "Move card" }), pageDone);

    const layoutBeta = board.locator("article.card").filter({ hasText: "Beta" });
    const layoutOpen = board.locator('section.lane[data-lane-kind="string"]').filter({ hasText: "open" });
    await dragCardToLane(page, layoutBeta.getByRole("button", { name: "Move card" }), layoutOpen);

    const doneLane = board.locator('section.lane[data-lane-kind="string"]').filter({ hasText: "done" });
    const movedAlpha = doneLane.locator("article.card").filter({ hasText: "Alpha" });
    await expect(movedAlpha).toBeVisible();

    await movedAlpha.getByRole("button", { name: "Edit title" }).click();
    // Opening the editor removes the title text used by `alpha`'s filter, so
    // reacquire the controls from the stable board boundary.
    const titleEditor = board.getByRole("textbox", { name: "Edit title" });
    await expect(titleEditor).toBeVisible();
    await titleEditor.fill("Alpha in layout");

    const peer = await context.newPage();
    await peer.goto(page.url());
    const peerDetail = peer.getByTestId("yjs-table-view").getByRole("button", {
        name: `detail-1, detail for ${fixture.recordIds[0]}`,
    });
    await peerDetail.click();
    const peerDetailEditor = peer.getByRole("textbox", { name: `detail for ${fixture.recordIds[0]}` });
    await peerDetailEditor.fill("peer detail");
    await peerDetailEditor.press("Enter");
    await expect(board.getByText("peer detail", { exact: true })).toBeVisible();
    await expect(titleEditor).toBeVisible();
    await expect(titleEditor).toHaveValue("Alpha in layout");
    await board.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("yjs-table-view").getByText("Alpha in layout", { exact: true })).toBeVisible();

    const source = (await readGridProjectState(page)).tables.find(table => table.id === fixture.tableId)!;
    expect(source.data[fixture.recordIds[0]]).toMatchObject({
        title: "Alpha in layout",
        status: "done",
        detail: "peer detail",
    });
    expect(source.data[fixture.recordIds[1]]).toMatchObject({ title: "Beta", status: "open" });
    expect(
        await layout.locator('[data-testid="layout-cell"]').evaluateAll(cells =>
            cells.map(cell => ({ id: cell.getAttribute("data-item-id"), style: cell.getAttribute("style") }))
        ),
    ).toEqual(before);

    await expect(peer.locator(`[data-kanban-id="${boardId}"]`).getByText("Alpha in layout", { exact: true }))
        .toBeVisible({ timeout: 30000 });
    await page.reload();
    await expect(page.locator(`[data-kanban-id="${boardId}"]`).getByText("Alpha in layout", { exact: true }))
        .toBeVisible({ timeout: 30000 });
});
