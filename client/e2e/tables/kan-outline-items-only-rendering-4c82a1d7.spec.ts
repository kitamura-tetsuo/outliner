/** @feature KAN-4c82a1d7 */
import { expect, test } from "@playwright/test";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    openKanbanList,
    readKanbanPurityState,
    readKanbans,
} from "../utils/kanbanTestHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const QUERY = "SELECT id, text, page_id FROM outline_items ORDER BY text";

test("renders and reloads an outline_items-only board without creating a user Table", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard", "Outline-only card"]);
    const source = page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Outline-only card" });
    const sourceId = await source.getAttribute("data-item-id");
    expect(sourceId).toBeTruthy();
    await page.evaluate(id => {
        const items = (globalThis as any).generalStore.currentPage.items;
        for (let index = 0; index < items.length; index++) {
            if (String(items.at(index).id) === id) items.at(index).due = "2026-10-18T09:00:00Z";
        }
    }, sourceId);
    const sourceBefore = await page.evaluate(id => {
        const items = (globalThis as any).generalStore.currentPage.items;
        for (let index = 0; index < items.length; index++) {
            const item = items.at(index);
            if (String(item.id) === id) return { id: String(item.id), text: item.text, due: item.due };
        }
    }, sourceId);

    await openKanbanList(page, fixture.projectName);
    const kanbanId = await createKanbanThroughUi(page, "Outline board", "");
    await configureKanbanThroughUi(page, { query: QUERY, group: "page_id", title: "text" });
    await expect(page.locator("article.card h3")).toHaveText(["Outline-only card"], { timeout: 30000 });
    expect(await readKanbanPurityState(page)).toMatchObject({ tables: [], grids: [] });

    const showSidebar = page.getByRole("button", { name: "Show sidebar" });
    if (await showSidebar.isVisible().catch(() => false)) await showSidebar.click();
    await page.locator('aside[aria-label="Main Sidebar"] [data-page-id]').first().click();
    const layout = (await createBlockFromItem(
        page,
        page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Dashboard" }),
        "Layout",
    )).getByTestId("layout-block");
    await layout.click({ button: "right" });
    await page.getByTestId("layout-add-kanban").click();
    const dialog = page.getByTestId("layout-kanban-dialog");
    await dialog.getByLabel("Existing board").check();
    await dialog.locator("select").nth(1).selectOption(kanbanId);
    await dialog.getByTestId("layout-kanban-confirm").click();
    const embedded = layout.getByTestId("kanban-board");
    await expect(embedded).toHaveAttribute("data-kanban-id", kanbanId);
    await expect(embedded.locator("article.card h3")).toHaveText(["Outline-only card"], { timeout: 30000 });

    await page.waitForTimeout(4000);
    await page.reload();
    await expect(page.getByTestId("kanban-board")).toHaveAttribute("data-kanban-id", kanbanId, { timeout: 30000 });
    await expect(page.locator("article.card h3")).toHaveText(["Outline-only card"], { timeout: 30000 });
    expect(await readKanbans(page)).toEqual([{
        id: kanbanId,
        name: "Outline board",
        query: QUERY,
        groupField: "page_id",
        titleField: "text",
        detailFields: [],
        laneOrder: [],
    }]);
    expect(await readKanbanPurityState(page)).toMatchObject({ tables: [], grids: [] });
    expect(
        await page.evaluate(id => {
            const items = (globalThis as any).generalStore.currentPage.items;
            for (let index = 0; index < items.length; index++) {
                const item = items.at(index);
                if (String(item.id) === id) return { id: String(item.id), text: item.text, due: item.due };
            }
        }, sourceId),
    ).toEqual(sourceBefore);

    await page.evaluate(id => {
        const items = (globalThis as any).generalStore.currentPage.items;
        for (let index = 0; index < items.length; index++) {
            if (String(items.at(index).id) === id) items.at(index).due = undefined;
        }
    }, sourceId);
    await expect(page.getByTestId("kanban-empty")).toHaveText("The query returned no cards.", { timeout: 30000 });
    await openKanbanList(page, fixture.projectName);
    await page.getByTestId("project-kanban-list").getByRole("link", { name: /Outline board/ }).click();
    await expect(page.getByTestId("kanban-empty")).toBeVisible({ timeout: 30000 });
    expect(await readKanbanPurityState(page)).toMatchObject({ tables: [], grids: [] });
});
