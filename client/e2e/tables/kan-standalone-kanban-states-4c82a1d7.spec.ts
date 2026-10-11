/** @feature KAN-4c82a1d7 */
import { expect, test } from "@playwright/test";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    createSourceThroughUi,
    openKanbanList,
    readKanbans,
} from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("distinguishes NULL/empty/literal lanes and renders a readonly projection", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createSourceThroughUi(page, testInfo);
    await openKanbanList(page, fixture.projectName);
    await createKanbanThroughUi(page, "Labels", fixture.tableId);
    const query =
        "SELECT title, detail, CASE WHEN title = 'Alpha' THEN NULL WHEN title = 'Beta' THEN '' ELSE 'NULL' END AS lane FROM tasks ORDER BY title";
    await configureKanbanThroughUi(page, { query, group: "lane", title: "title", details: ["detail"] });
    await expect(page.locator("section.lane")).toHaveCount(3, { timeout: 30000 });
    await expect(page.locator("section.lane h2")).toHaveText(["SQL NULL", "Empty string", "NULL"]);
    expect(
        await page.locator("section.lane").evaluateAll(lanes => lanes.map(lane => lane.getAttribute("data-lane-kind"))),
    )
        .toEqual(["null", "empty", "string"]);
    await expect(page.locator("article.card h3")).toHaveText(["Alpha", "Beta", "Gamma"]);
    expect((await readKanbans(page))[0]).toMatchObject({ query, groupField: "lane", titleField: "title" });
});

test(
    "shows missing-field, zero-row, and missing-source states without rewriting settings",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await createSourceThroughUi(page, testInfo);
        await openKanbanList(page, fixture.projectName);
        const id = await createKanbanThroughUi(page, "Diagnostics", fixture.tableId);
        await configureKanbanThroughUi(page, {
            query: "SELECT id, status FROM tasks",
            group: "status",
            title: "missing_title",
        });
        await expect(page.getByTestId("kanban-invalid")).toContainText(
            'Configured result column "missing_title" is missing',
            { timeout: 30000 },
        );
        expect((await readKanbans(page))[0].titleField).toBe("missing_title");

        await page.getByRole("button", { name: "Configure" }).click();
        await page.getByLabel("Title column").fill("");
        await page.getByTestId("kanban-config").getByRole("button", { name: "Apply" }).click();
        await configureKanbanThroughUi(page, {
            query: "SELECT id, title, status, detail FROM tasks WHERE false ORDER BY id",
            group: "status",
            title: "title",
        });
        await expect(page.getByTestId("kanban-empty")).toBeVisible({ timeout: 30000 });

        await page.getByTestId("kanban-source-table-link").click();
        await page.getByRole("button", { name: "Delete table", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Delete table and keep references" }).click();
        await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/kanbans/${id}`);
        await expect(page.getByTestId("kanban-missing-source")).toBeVisible({ timeout: 30000 });
        expect((await readKanbans(page))[0].sourceTableId).toBe(fixture.tableId);
    },
);
