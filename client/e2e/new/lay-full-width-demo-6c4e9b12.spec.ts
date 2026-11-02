/** @feature LAY-6c4e9b12 */
import { expect, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

async function expectFluid(page: Page) {
    const routeMain = page.getByTestId("fluid-page-main");
    await expect(routeMain).toBeVisible();
    await expect.poll(async () => {
        const parent = await page.locator("#main-content").boundingBox();
        const child = await routeMain.boundingBox();
        return !!parent && !!child && Math.abs(parent.x - child.x) <= 1
            && Math.abs(parent.width - child.width) <= 1;
    }, { timeout: 15000 }).toBe(true);
}

for (const demo of [{ slug: "demo", pageTitle: "Formatting" }, { slug: "demo-ja", pageTitle: "書式" }]) {
    test(`${demo.slug} project home and editor use the full allocated width`, async ({ page }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: 1920, height: 900 });
        await page.goto(`/${demo.slug}`);
        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });
        await expectFluid(page);

        await pageList.getByText(demo.pageTitle, { exact: true }).first().click();
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 30000 });
        await expectFluid(page);
        await page.setViewportSize({ width: 2560, height: 900 });
        await expectFluid(page);
        await page.setViewportSize({ width: 1280, height: 900 });
        await expectFluid(page);
    });
}
