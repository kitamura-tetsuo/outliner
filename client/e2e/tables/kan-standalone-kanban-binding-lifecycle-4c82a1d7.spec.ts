/** @feature KAN-4c82a1d7 */
import { expect, test } from "@playwright/test";
import { configureGrid, createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    createSourceThroughUi,
    openKanbanList,
    readKanbans,
    TASK_QUERY,
    TASK_SCHEMA,
} from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test(
    "source rebinding and same-ID replacement invalidate mounted drafts and subscriptions",
    async ({ page, context }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await createSourceThroughUi(page, testInfo);
        await createBlankGrid(page, "Tasks B", "tasks_b");
        await configureGrid(
            page,
            1,
            TASK_SCHEMA.replace("tasks", "tasks_b"),
            TASK_QUERY.replace("tasks", "tasks_b"),
            "Title",
        );
        const tableB = (await readGridProjectState(page)).tables.find(table => table.sqlName === "tasks_b");
        if (!tableB) throw new Error("Second source Table was not created through the production UI");

        await openKanbanList(page, fixture.projectName);
        const id = await createKanbanThroughUi(page, "Binding board", fixture.tableId);
        await configureKanbanThroughUi(page, { query: TASK_QUERY, group: "status", title: "title" });
        const peer = await context.newPage();
        await peer.goto(page.url());
        await expect(peer.getByTestId("kanban-board")).toBeVisible({ timeout: 30000 });

        await page.getByRole("button", { name: "Configure" }).click();
        await page.getByTestId("kanban-config").getByLabel("Name").fill("Stale source draft");
        await peer.evaluate(({ kanbanId, sourceTableId }) => {
            const doc = (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc;
            doc.getMap("yjsKanbans").get(kanbanId).set("sourceTableId", sourceTableId);
        }, { kanbanId: id, sourceTableId: tableB.id });
        await expect(page.getByTestId("kanban-config")).toHaveCount(0);
        await expect(page.getByTestId("kanban-source-table-link")).toHaveAttribute("href", new RegExp(tableB.id));
        expect((await readKanbans(page))[0]).toMatchObject({ name: "Binding board", sourceTableId: tableB.id });

        await page.getByRole("button", { name: "Configure" }).click();
        await page.getByTestId("kanban-config").getByLabel("Name").fill("Stale replacement draft");
        await peer.evaluate(({ kanbanId, sourceTableId }) => {
            const doc = (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc;
            const registry = doc.getMap("yjsKanbans");
            const prior = registry.get(kanbanId);
            const replacement = new prior.constructor();
            replacement.set("name", "Binding board");
            replacement.set("sourceTableId", sourceTableId);
            replacement.set("query", "SELECT id, title, status, detail FROM tasks_b ORDER BY id");
            replacement.set("groupField", "status");
            replacement.set("titleField", "title");
            replacement.set("detailFields", []);
            replacement.set("laneOrder", []);
            doc.transact(() => registry.set(kanbanId, replacement));
        }, { kanbanId: id, sourceTableId: tableB.id });
        await expect(page.getByTestId("kanban-config")).toHaveCount(0);
        await expect(page.getByTestId("kanban-source-table-link")).toHaveAttribute("href", new RegExp(tableB.id));
        expect((await readKanbans(page))[0]).toMatchObject({ name: "Binding board", sourceTableId: tableB.id });
    },
);
