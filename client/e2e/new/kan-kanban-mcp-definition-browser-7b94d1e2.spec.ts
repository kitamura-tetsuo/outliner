/** @feature KAN-7b94d1e2 */
import { expect, test } from "@playwright/test";
import { CatalogBrowserServer, type CatalogSnapshot } from "../utils/catalogBrowserServer";
import { configureCatalogPage } from "../utils/catalogBrowserUi";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
    setCellValue,
} from "../utils/crossProjectGridHelpers";
import { readKanbanPurityState, TASK_QUERY, TASK_SCHEMA } from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test(
    "remote Kanban definition mutations persist and synchronize into the ordinary browser board",
    async ({ page }, info) => {
        test.setTimeout(180_000);
        const server = await CatalogBrowserServer.start(info);
        try {
            const title = `Remote Kanban definition ${Date.now()}`;
            const projectId = SeedClient.stableIdFromTitle(title);
            const token = await TestHelpers.getTestAuthToken();
            await server.request("seed", { token, projectId, title, pageName: "Workspace" });
            await configureCatalogPage(page, server.port);
            await TestHelpers.seedProjectAndNavigate(page, info, [], undefined, {
                projectName: title,
                pageName: "Workspace",
                skipSeed: true,
                ws: "force",
            });

            // Build the source and an unrelated Grid through production browser state.
            await createBlankGrid(page, "Tasks", "tasks");
            await configureGrid(page, 0, TASK_SCHEMA, TASK_QUERY, "Title");
            for (let count = 1; count <= 3; count++) await addSourceRecord(page, 0, count);
            const table = (await readGridProjectState(page)).tables.find(value => value.sqlName === "tasks");
            if (!table) throw new Error("UI did not create the source Table");
            const recordIds = Object.keys(table.data).sort();
            for (const [index, id] of recordIds.entries()) {
                await setCellValue(page, 0, id, "title", ["Alpha", "Beta", "Gamma"][index]!);
                await setCellValue(page, 0, id, "status", ["open", "done", "open"][index]!);
                await setCellValue(page, 0, id, "detail", `detail-${index + 1}`);
            }
            const browserSourceBefore = await readKanbanPurityState(page);
            await expect.poll(
                async () =>
                    (await server.request<CatalogSnapshot>(
                        "snapshot",
                        { projectId, tableId: table.id, persisted: true },
                    )).table?.records,
                { timeout: 60_000, intervals: [1_000, 2_000, 5_000] },
            ).toEqual(table.data);
            const persistedBefore = await server.request<CatalogSnapshot>(
                "snapshot",
                { projectId, tableId: table.id, persisted: true },
            );
            await page.close();

            const mcp = (name: string, args: object) =>
                server.request<any>("mcp", { token, name, arguments: { projectId, ...args } });
            const created = await mcp("create_kanban", {
                operationId: "browser-create",
                settings: {
                    name: "Remote work board",
                    query: TASK_QUERY,
                    groupField: "status",
                    titleField: "title",
                    detailFields: ["detail"],
                    laneOrder: ["done", "open"],
                },
            });
            expect(created).toMatchObject({ saved: true, applied: true, replayed: false });
            const persistedCreated = await server.request<CatalogSnapshot>("snapshot", {
                projectId,
                tableId: table.id,
                persisted: true,
            });
            expect((persistedCreated.project as any).kanbans[created.kanbanId]).toMatchObject(created.settings);
            expect(persistedCreated.table).toEqual(persistedBefore.table);

            const browserPage = await page.context().newPage();
            await configureCatalogPage(browserPage, server.port);
            await TestHelpers.seedProjectAndNavigate(browserPage, info, [], undefined, {
                projectName: title,
                pageName: "Workspace",
                skipSeed: true,
                ws: "force",
            });
            await browserPage.goto(`/${encodeURIComponent(title)}/-/kanbans/${created.kanbanId}`);
            const board = browserPage.getByTestId("kanban-board");
            await expect(board).toBeVisible({ timeout: 30_000 });
            await expect(board.locator("article.card h3")).toHaveText(["Beta", "Alpha", "Gamma"]);

            const observed = await mcp("get_kanban", { kanbanId: created.kanbanId });
            const updated = await mcp("update_kanban", {
                kanbanId: created.kanbanId,
                observationToken: observed.observationToken,
                changes: { laneOrder: ["open", "done"] },
                operationId: "browser-update",
            });
            expect(updated).toMatchObject({ saved: true, applied: true, replayed: false });
            await expect(board.locator("article.card h3")).toHaveText(["Alpha", "Gamma", "Beta"]);
            await browserPage.reload();
            await expect(browserPage.getByTestId("kanban-board")).toHaveAttribute("data-kanban-id", created.kanbanId);
            await expect(browserPage.locator("article.card h3")).toHaveText(["Alpha", "Gamma", "Beta"]);

            const persistedAfter = await server.request<CatalogSnapshot>("snapshot", {
                projectId,
                tableId: table.id,
                persisted: true,
            });
            expect((persistedAfter.project as any).kanbans[created.kanbanId]).toMatchObject({
                ...created.settings,
                laneOrder: ["open", "done"],
            });
            expect(persistedAfter.table).toEqual(persistedBefore.table);
            expect(await readKanbanPurityState(browserPage)).toEqual(browserSourceBefore);
        } finally {
            await server.close();
        }
    },
);
