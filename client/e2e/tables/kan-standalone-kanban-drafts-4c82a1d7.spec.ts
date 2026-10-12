/** @feature KAN-4c82a1d7 */
import { expect, type Page, test } from "@playwright/test";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    createSourceThroughUi,
    openKanbanList,
    readKanbans,
    TASK_QUERY,
} from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

async function editQueryWithoutApplying(page: Page, query: string): Promise<void> {
    await page.getByRole("button", { name: "Configure" }).click();
    const editor = new SqlEditorHelper(page.getByTestId("kanban-query-editor"));
    await editor.waitForReady();
    await editor.setValue(page, query);
    await editor.commit(page);
}

test("Cancel is inert and a same-setting peer update rejects the stale draft", async ({ page, context }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createSourceThroughUi(page, testInfo);
    await openKanbanList(page, fixture.projectName);
    await createKanbanThroughUi(page, "Shared board", fixture.tableId);
    await configureKanbanThroughUi(page, { query: TASK_QUERY, group: "status", title: "title" });
    const url = page.url();

    await editQueryWithoutApplying(page, `${TASK_QUERY} LIMIT 1`);
    await page.getByTestId("kanban-config").getByRole("button", { name: "Cancel" }).click();
    expect((await readKanbans(page))[0].query).toBe(TASK_QUERY);

    await editQueryWithoutApplying(page, `${TASK_QUERY} LIMIT 1`);
    const peer = await context.newPage();
    await peer.goto(url);
    await expect(peer.getByTestId("kanban-board")).toBeVisible({ timeout: 30000 });
    await configureKanbanThroughUi(peer, { query: `${TASK_QUERY} OFFSET 1`, group: "status", title: "title" });
    await expect.poll(async () => (await readKanbans(page))[0].query).toBe(`${TASK_QUERY} OFFSET 1`);
    await page.getByTestId("kanban-config").getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("kanban-draft-conflict")).toContainText("query");
    await expect(new SqlEditorHelper(page.getByTestId("kanban-query-editor")).value()).resolves.toBe(
        `${TASK_QUERY} LIMIT 1`,
    );
    expect((await readKanbans(page))[0].query).toBe(`${TASK_QUERY} OFFSET 1`);
});

test("a disjoint peer role edit survives a local query save", async ({ page, context }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createSourceThroughUi(page, testInfo);
    await openKanbanList(page, fixture.projectName);
    await createKanbanThroughUi(page, "Shared board", fixture.tableId);
    await configureKanbanThroughUi(page, { query: TASK_QUERY, group: "status", title: "title" });
    await editQueryWithoutApplying(page, `${TASK_QUERY} LIMIT 2`);
    const peer = await context.newPage();
    await peer.goto(page.url());
    await expect(peer.getByTestId("kanban-board")).toBeVisible({ timeout: 30000 });
    await configureKanbanThroughUi(peer, { query: TASK_QUERY, group: "status", title: "detail" });
    await expect.poll(async () => (await readKanbans(page))[0].titleField).toBe("detail");
    await page.getByTestId("kanban-config").getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("kanban-config")).toHaveCount(0);
    expect((await readKanbans(page))[0]).toMatchObject({ query: `${TASK_QUERY} LIMIT 2`, titleField: "detail" });
});
