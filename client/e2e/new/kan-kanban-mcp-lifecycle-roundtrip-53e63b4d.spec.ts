/** @feature FTR-53e63b4d */
import { expect, test } from "@playwright/test";
import { CatalogBrowserServer } from "../utils/catalogBrowserServer";
import { configureCatalogPage } from "../utils/catalogBrowserUi";
import { createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { createKanbanThroughUi, openKanbanList } from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test("remote Kanban placement, removal and deletion survive browser reload", async ({ page }, info) => {
    test.setTimeout(180_000);
    const server = await CatalogBrowserServer.start(info);
    try {
        const title = `Kanban lifecycle ${Date.now()}`;
        const projectId = SeedClient.stableIdFromTitle(title);
        const token = await TestHelpers.getTestAuthToken();
        const seeded = await server.request("seed", { token, projectId, title, pageName: "Workspace" });
        await configureCatalogPage(page, server.port);
        // Use the same authenticated production server for Project directory reads.
        await page.route("**/api/projects**", async route => {
            const requested = new URL(route.request().url());
            const response = await route.fetch({
                url: `http://127.0.0.1:${server.port}${requested.pathname}${requested.search}`,
            });
            await route.fulfill({ response });
        });
        await TestHelpers.seedProjectAndNavigate(page, info, [], undefined, {
            projectName: title,
            pageName: "Workspace",
            skipSeed: true,
            ws: "force",
        });
        await createBlankGrid(page, "Tasks", "tasks");
        const table = (await readGridProjectState(page)).tables.find(value => value.sqlName === "tasks");
        if (!table) throw new Error("UI did not create the source Table");
        await openKanbanList(page, title);
        const kanbanId = await createKanbanThroughUi(page, "Work board", table.id);
        const showSidebar = page.getByRole("button", { name: "Show sidebar" });
        if (await showSidebar.isVisible()) await showSidebar.click();
        await page.locator("aside [data-page-id]").first().click();
        const mcp = (name: string, args: object) =>
            server.request("mcp", {
                token,
                name,
                arguments: { projectId, ...args },
            });
        const observe = () => mcp("get_kanban", { kanbanId });
        const place = async (operationId: string) => {
            const observed = await observe();
            return mcp("place_kanban", {
                kanbanId,
                observationToken: observed.observationToken,
                destination: { pageId: seeded.pageId },
                operationId,
            });
        };
        const first = await place("browser-place-1");
        const board = page.locator(`[data-item-id="${first.itemId}"] [data-testid="kanban-board"]`);
        await expect(board).toHaveAttribute("data-kanban-id", kanbanId);
        await page.reload();
        await expect(board).toHaveAttribute("data-kanban-id", kanbanId);
        const removal = await observe();
        await mcp("remove_kanban_placement", {
            kanbanId,
            placementId: first.placementId,
            observationToken: removal.observationToken,
            operationId: "browser-remove",
        });
        await expect(board).toHaveCount(0);
        await page.reload();
        await expect(page.getByText("Catalog integration", { exact: true })).toBeVisible();
        await expect(board).toHaveCount(0);
        const second = await place("browser-place-2");
        const secondBoard = page.locator(`[data-item-id="${second.itemId}"] [data-testid="kanban-board"]`);
        await expect(secondBoard).toHaveAttribute("data-kanban-id", kanbanId);
        const deletion = await observe();
        const deleted = await mcp("delete_kanban", {
            kanbanId,
            observationToken: deletion.observationToken,
            operationId: "browser-delete",
        });
        expect(deleted.removedPlacementIds).toContain(second.placementId);
        await expect(secondBoard).toHaveCount(0);
        await page.reload();
        await expect(page.getByText("Catalog integration", { exact: true })).toBeVisible();
        await expect(secondBoard).toHaveCount(0);
        expect(
            (await mcp("list_kanbans", {})).kanbans.some((entry: { kanbanId: string; }) => entry.kanbanId === kanbanId),
        ).toBe(false);
    } finally {
        await server.close();
    }
});
