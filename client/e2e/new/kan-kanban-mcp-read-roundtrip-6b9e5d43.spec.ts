/** @feature KAN-6b9e5d43 */
import { expect, test } from "@playwright/test";
import { CatalogBrowserServer } from "../utils/catalogBrowserServer";
import { configureCatalogPage } from "../utils/catalogBrowserUi";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
    setCellValue,
} from "../utils/crossProjectGridHelpers";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    openKanbanList,
    readKanbans,
    TASK_QUERY,
    TASK_SCHEMA,
} from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test(
    "a browser-configured Kanban is readable through the independent production MCP endpoint",
    async ({ page }, info) => {
        test.setTimeout(180_000);
        const server = await CatalogBrowserServer.start(info);
        try {
            const title = `Kanban MCP roundtrip ${Date.now()}`;
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

            await openKanbanList(page, title);
            const kanbanId = await createKanbanThroughUi(page, "Work board", table.id);
            await configureKanbanThroughUi(page, {
                query: TASK_QUERY,
                group: "status",
                title: "title",
                details: ["detail"],
                lanes: ["done", "open"],
            });
            await expect(page.locator("article.card h3")).toHaveText(["Beta", "Alpha", "Gamma"]);
            expect((await readKanbans(page)).find(board => board.id === kanbanId)).toMatchObject({
                name: "Work board",
                query: TASK_QUERY,
                groupField: "status",
                titleField: "title",
            });

            const mcp = (name: string, args: object) =>
                server.request("mcp", { token, name, arguments: { projectId, ...args } });
            // Keep the successful production response as the mutation oracle. Re-querying
            // the same projection here duplicated the expensive SQL boundary and left the
            // browser-close assertions without enough of the fixed test budget under load.
            let observed: any;
            await expect.poll(async () => {
                const current = await mcp("query_kanban", { kanbanId });
                if (current.projection.status === "success") observed = current;
                return observed
                    ? observed.lanes.flatMap((lane: { cards: { row: { title: string; }; }[]; }) =>
                        lane.cards.map(card => card.row.title)
                    )
                    : current.projection.status;
            }, { timeout: 60_000, intervals: [1_000, 2_000, 5_000] }).toEqual(["Beta", "Alpha", "Gamma"]);

            const observedCard = observed.lanes
                .flatMap((lane: { cards: { row: { title: string; }; sourceRef: object; }[]; }) => lane.cards)
                .find((card: { row: { title: string; }; }) => card.row.title === "Alpha");
            expect(observedCard).toBeDefined();
            const updated = await mcp("update_kanban_card", {
                kanbanId,
                sourceRef: observedCard!.sourceRef,
                observationToken: observed.observationToken,
                outputField: "title",
                value: "Alpha from MCP",
                operationId: `browser-sync-${Date.now()}`,
            });
            expect(updated).toMatchObject({ applied: true, dryRun: false, operation: "update" });
            await expect(page.locator("article.card h3")).toHaveText(["Beta", "Alpha from MCP", "Gamma"]);

            // No browser-held room may be needed by the next remote observation.
            await page.close();
            const listed = await mcp("list_kanbans", {});
            expect(listed.kanbans).toContainEqual({ kanbanId, name: "Work board" });
            const saved = await mcp("get_kanban", { kanbanId });
            expect(saved.settings).toMatchObject({
                name: "Work board",
                query: TASK_QUERY,
                groupField: "status",
                titleField: "title",
                detailFields: ["detail"],
                laneOrder: ["done", "open"],
            });
            const read = await mcp("query_kanban", { kanbanId });
            expect(read.projection).toMatchObject({ status: "success", current: true });
            expect(read.lanes.map((lane: { key: string; }) => lane.key)).toEqual(["done", "open"]);
            expect(
                read.lanes.flatMap((lane: { cards: { row: { title: string; }; }[]; }) =>
                    lane.cards.map(card => card.row.title)
                ),
            ).toEqual(["Beta", "Alpha from MCP", "Gamma"]);
            const cards = read.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards);
            expect(
                cards.every((card: { sourceRef: { kind: string; id: string; }; }) =>
                    card.sourceRef?.kind === "table" && card.sourceRef.id === table.id
                ),
            ).toBe(true);
            expect(read.mutationObservation.available).toBe(true);
        } finally {
            await server.close();
        }
    },
);
