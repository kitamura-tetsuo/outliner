/** @feature FTR-5527ca5e */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const GRID_ID = "demo-table-tasks-priority-grid";
const EXPECTED_IDS = [
    "demo-task-done",
    "demo-task-overdue",
    "demo-task-today",
    "demo-task-upcoming",
    "demo-task-recurring",
];

for (
    const demo of [
        {
            slug: "demo",
            page: "Tasks%20and%20Habits",
            guidance: "ordinary ORDER BY priority sorts text lexically",
        },
        {
            slug: "demo-ja",
            page: "%E3%82%BF%E3%82%B9%E3%82%AF%E3%81%A8%E7%BF%92%E6%85%A3",
            guidance: "通常の ORDER BY priority は文字列を辞書順",
        },
    ]
) {
    test(`${demo.slug} links to a live semantic-priority Grid`, async ({ page }) => {
        await page.goto(`/${demo.slug}/${demo.page}`);

        await expect(page.getByText(demo.guidance, { exact: false })).toBeVisible({ timeout: 30000 });
        const exampleLink = page.locator(`a[href='/${demo.slug}/-/grids/${GRID_ID}']`);
        await expect(exampleLink).toBeVisible({ timeout: 30000 });
        await exampleLink.click();

        await expect(page).toHaveURL(new RegExp(`/${demo.slug}/-/grids/${GRID_ID}$`));
        const view = page.getByTestId("yjs-table-view");
        await expect(view).toHaveAttribute("data-source-table-id", "demo-table-tasks", { timeout: 30000 });
        const rows = view.getByTestId("yjs-table-grid").locator("tbody tr");
        await expect(rows).toHaveCount(EXPECTED_IDS.length, { timeout: 30000 });
        expect(await rows.evaluateAll(elements => elements.map(row => row.getAttribute("data-record-id"))))
            .toEqual(EXPECTED_IDS);
        expect(await rows.locator("td[data-col='priority']").allTextContents())
            .toEqual(["high", "high", "medium", "medium", "low"]);

        await view.getByTestId("yjs-table-toggle-ui").click();
        const queryEditor = view.getByTestId("yjs-table-query-input");
        await expect(queryEditor).toBeVisible();
        await expect(queryEditor.locator(".view-lines")).toContainText("ORDER BY CASE priority", {
            timeout: 30000,
        });
        await expect(queryEditor.locator(".view-lines")).toContainText("WHEN 'medium' THEN 1");
    });
}
