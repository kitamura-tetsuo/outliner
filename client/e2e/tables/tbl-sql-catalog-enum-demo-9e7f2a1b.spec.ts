import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// SQL-9e7f2a1b: the public /demo project seeds an executable ENUM demo — the
// feedback_sentiment catalog type and the Feedback table that uses it —
// rendered through the real project transport, engine materialization and
// grid UI with no login.
test.describe("SQL catalog ENUM demo", () => {
    test("the SQL Catalog page renders the seeded Feedback grid with its ENUM column", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });
        await pageList.getByText("SQL Catalog", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo\/SQL%20Catalog$/, { timeout: 15000 });

        const feedbackTable = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").getByText("Feedback", { exact: true }),
        }).first();
        await expect(feedbackTable).toBeVisible({ timeout: 30000 });
        await expect(feedbackTable.getByTestId("yjs-table-grid")).toBeVisible({ timeout: 30000 });
        await expect(
            feedbackTable.getByTestId("yjs-table-grid").locator("th", { hasText: "sentiment" }),
        ).toBeVisible({ timeout: 30000 });
        // The rows carry the catalog's declared labels through the real engine.
        await expect(
            feedbackTable.getByTestId("yjs-table-grid").getByText("positive", { exact: true }).first(),
        ).toBeVisible({ timeout: 30000 });
    });

    test("the demo Types page exposes the seeded feedback_sentiment declaration", async ({ page }) => {
        await page.goto("/demo/-/types");

        const catalogList = page.getByTestId("sql-catalog-list");
        await expect(catalogList).toBeVisible({ timeout: 30000 });
        await expect(catalogList.getByText("Feedback Sentiment", { exact: false }).first()).toBeVisible({
            timeout: 15000,
        });
    });
});
