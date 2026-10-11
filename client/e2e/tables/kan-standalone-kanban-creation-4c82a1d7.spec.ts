/** @feature KAN-4c82a1d7 */
import { expect, test } from "@playwright/test";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    createSourceThroughUi,
    openKanbanList,
    readKanbans,
    TASK_QUERY,
} from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test(
    "creates, configures, renders, reloads, and reconstructs a standalone board",
    async ({ page, context }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await createSourceThroughUi(page, testInfo);
        await openKanbanList(page, fixture.projectName);
        const id = await createKanbanThroughUi(page, "Work board", fixture.tableId);
        await configureKanbanThroughUi(page, {
            query: TASK_QUERY,
            group: "status",
            title: "title",
            details: ["detail"],
            lanes: ["done", "open"],
        });
        await expect(page.locator('[data-lane-kind="string"] h2')).toHaveText(["done", "open"]);
        await expect(page.locator("article.card h3")).toHaveText(["Beta", "Alpha", "Gamma"]);
        expect(await readKanbans(page)).toEqual([{
            id,
            name: "Work board",
            sourceTableId: fixture.tableId,
            query: TASK_QUERY,
            groupField: "status",
            titleField: "title",
            detailFields: ["detail"],
            laneOrder: ["done", "open"],
        }]);

        await page.reload();
        await expect(page.getByTestId("kanban-board")).toHaveAttribute("data-kanban-id", id, { timeout: 30000 });
        await expect(page.locator("article.card h3")).toHaveText(["Beta", "Alpha", "Gamma"], { timeout: 30000 });
        const peer = await context.newPage();
        await peer.goto(page.url());
        await expect(peer.getByTestId("kanban-board")).toHaveAttribute("data-kanban-id", id, { timeout: 30000 });
        await expect(peer.locator("article.card")).toHaveCount(3, { timeout: 30000 });
    },
);

test("keeps equal-named boards over one Table independent", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createSourceThroughUi(page, testInfo);
    await openKanbanList(page, fixture.projectName);
    const first = await createKanbanThroughUi(page, "Board", fixture.tableId);
    await configureKanbanThroughUi(page, { query: `${TASK_QUERY} LIMIT 1`, group: "status", title: "title" });
    await openKanbanList(page, fixture.projectName);
    const second = await createKanbanThroughUi(page, "Board", fixture.tableId);
    await configureKanbanThroughUi(page, { query: TASK_QUERY, group: "status", title: "title", details: ["detail"] });
    expect(first).not.toBe(second);
    const states = (await readKanbans(page)).sort((a, b) => a.id.localeCompare(b.id));
    expect(states).toHaveLength(2);
    expect(new Set(states.map(board => board.query))).toEqual(new Set([`${TASK_QUERY} LIMIT 1`, TASK_QUERY]));
    await openKanbanList(page, fixture.projectName);
    await expect(page.getByTestId("project-kanban-list").getByText("Board", { exact: false })).toHaveCount(2);
    expect(await page.getByTestId("project-kanban-list").locator("code").allTextContents())
        .toEqual(expect.arrayContaining([first, second]));
});
