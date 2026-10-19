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

test("settings Apply, Undo and Redo reproject an unchanged SELECT", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createSourceThroughUi(page, testInfo);
    await openKanbanList(page, fixture.projectName);
    await createKanbanThroughUi(page, "Live settings", fixture.tableId);
    await configureKanbanThroughUi(page, {
        query: TASK_QUERY,
        group: "status",
        title: "missing_title",
    });
    await expect(page.getByTestId("kanban-invalid")).toContainText('"missing_title" is missing', { timeout: 30000 });

    await page.getByRole("button", { name: "Configure" }).click();
    await page.getByLabel("Title column").fill("title");
    await page.getByTestId("kanban-config").getByRole("button", { name: "Apply" }).click();
    await expect(page.locator("article.card h3")).toHaveText(["Alpha", "Gamma", "Beta"], { timeout: 30000 });
    expect((await readKanbans(page))[0].query).toBe(TASK_QUERY);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("kanban-invalid")).toContainText('"missing_title" is missing', { timeout: 30000 });
    await expect(page.getByRole("button", { name: "Configure" })).toBeVisible();

    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.locator("article.card h3")).toHaveText(["Alpha", "Gamma", "Beta"], { timeout: 30000 });
    expect((await readKanbans(page))[0]).toMatchObject({ query: TASK_QUERY, titleField: "title" });
});
