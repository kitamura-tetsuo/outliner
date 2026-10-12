import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-5f2c8e41: Both public demos seed an executable ENUM example — a
// Project-catalog TYPE, a separate Table using it, and a live Grid whose
// ordinary ORDER BY follows declaration order. Anonymous visitors reach it
// from the locale feature-tour navigation with no catalog-write access.
test.describe("ENUM declaration-order demo", () => {
    test("the /demo ENUM page shows the bound live grid in declaration order", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });
        await pageList.getByText("ENUM Ordering", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo\/ENUM%20Ordering$/, { timeout: 15000 });
        await expect(page.getByText("Please log in.")).not.toBeVisible();
        await expect(
            page.getByText(
                "CREATE TYPE demo_priority AS ENUM ('high', 'medium', 'low')",
                { exact: false },
            ).first(),
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByText(
                "SELECT id, title, priority FROM enum_priorities ORDER BY priority, id",
                { exact: false },
            ).first(),
        ).toBeVisible({ timeout: 30000 });

        const enumTable = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").getByText("ENUM Priorities", { exact: true }),
        }).first();
        await expect(enumTable).toBeVisible({ timeout: 30000 });
        const grid = enumTable.getByTestId("yjs-table-grid");
        await expect(grid).toBeVisible({ timeout: 30000 });
        await expect(grid.locator("th", { hasText: "priority" })).toBeVisible();

        // Declaration order (high, medium, low), not lexical text order
        // (high, low, medium): the type itself carries the order.
        const gridText = await grid.innerText();
        const outage = gridText.indexOf("Fix the outage");
        const sprint = gridText.indexOf("Plan the sprint");
        const docs = gridText.indexOf("Tidy the docs");
        expect(outage).toBeGreaterThanOrEqual(0);
        expect(sprint).toBeGreaterThanOrEqual(0);
        expect(docs).toBeGreaterThanOrEqual(0);
        expect(outage).toBeLessThan(sprint);
        expect(sprint).toBeLessThan(docs);
    });

    test("the /demo-ja ENUM page shows the same grid with localized guidance", async ({ page }) => {
        await page.goto("/demo-ja");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });
        await pageList.getByText("ENUM の順序", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo-ja\/.+$/, { timeout: 15000 });
        await expect(page.getByText("Please log in.")).not.toBeVisible();
        await expect(
            page.getByText("書き込み権限は不要", { exact: false }).first(),
        ).toBeVisible({ timeout: 30000 });
        // SQL and enum labels are never translated: the exact shared source.
        await expect(
            page.getByText(
                "CREATE TYPE demo_priority AS ENUM ('high', 'medium', 'low')",
                { exact: false },
            ).first(),
        ).toBeVisible({ timeout: 30000 });

        const enumTable = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").getByText("ENUM 優先度", { exact: true }),
        }).first();
        await expect(enumTable).toBeVisible({ timeout: 30000 });
        const grid = enumTable.getByTestId("yjs-table-grid");
        await expect(grid).toBeVisible({ timeout: 30000 });

        const gridText = await grid.innerText();
        const outage = gridText.indexOf("障害対応を直す");
        const sprint = gridText.indexOf("スプリントを計画する");
        const docs = gridText.indexOf("ドキュメントを整理する");
        expect(outage).toBeGreaterThanOrEqual(0);
        expect(sprint).toBeGreaterThanOrEqual(0);
        expect(docs).toBeGreaterThanOrEqual(0);
        expect(outage).toBeLessThan(sprint);
        expect(sprint).toBeLessThan(docs);
    });
});
