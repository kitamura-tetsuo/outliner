import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-f8800456: the public demo ships one project per language. /demo-ja opens
// the Japanese demo (room projects/demo-ja) with its own content, while /demo
// keeps serving the English one unchanged.
test.describe("Multilingual demo projects", () => {
    test("the Japanese demo route shows the Japanese page list", async ({ page }) => {
        await page.goto("/demo-ja");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        for (
            const title of [
                "ようこそ",
                "書式",
                "アウトライナーの基本",
                "内部リンク",
                "共同編集",
                "カレンダー",
            ]
        ) {
            await expect(pageList.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 15000 });
        }

        // The English titles belong to the other demo project.
        await expect(pageList.getByText("Formatting", { exact: true })).toHaveCount(0);
    });

    test("selecting a Japanese page opens it inside the Japanese demo", async ({ page }) => {
        await page.goto("/demo-ja");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        await pageList.getByText("書式", { exact: true }).first().click();

        // Stays in /demo-ja: the demo's slug is its own URL segment, so an
        // internal link can never cross into the English demo.
        await expect(page).toHaveURL(/\/demo-ja\/%E6%9B%B8%E5%BC%8F$/, { timeout: 15000 });
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByText("このページでは Scrapbox 風の記法", { exact: false }).first(),
        ).toBeVisible({ timeout: 30000 });
    });

    test("the English demo is unchanged", async ({ page }) => {
        // The regression guard for the route rename: /demo must keep emitting
        // byte-identical URLs and its own English content.
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        await expect(pageList.getByText("Welcome", { exact: true }).first()).toBeVisible({ timeout: 15000 });
        await expect(pageList.getByText("Formatting", { exact: true }).first()).toBeVisible({ timeout: 15000 });
        await expect(pageList.getByText("ようこそ", { exact: true })).toHaveCount(0);

        await pageList.getByText("Formatting", { exact: true }).first().click();
        await expect(page).toHaveURL(/\/demo\/Formatting$/, { timeout: 15000 });
    });
});
