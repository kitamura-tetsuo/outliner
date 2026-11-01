/** @feature LAY-6c4e9b12 */
import { expect, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

const main = (page: Page) => page.getByTestId("fluid-page-main");

async function expectMainFillsAllocation(page: Page, expectedPadding: number) {
    await expect(main(page)).toBeVisible();
    await expect.poll(async () => {
        const [shellBox, mainBox] = await Promise.all([
            page.locator("#main-content").boundingBox(),
            main(page).boundingBox(),
        ]);
        if (!shellBox || !mainBox) return false;
        return Math.abs(shellBox.x - mainBox.x) <= 1
            && Math.abs(shellBox.width - mainBox.width) <= 1;
    }, { timeout: 10000 }).toBe(true);
    expect(await main(page).evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBe(expectedPadding);
}

async function setSidebars(page: Page, leftOpen: boolean, databaseOpen: boolean) {
    const left = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    const database = page.locator('aside.sidebar[aria-label="Database Sidebar"]');
    const currentLeft = await left.evaluate(el => el.classList.contains("open"));
    const currentDatabase = await database.evaluate(el => el.classList.contains("open"));
    if (currentLeft !== leftOpen) await page.locator("button.sidebar-toggle").click();
    if (currentDatabase !== databaseOpen) {
        await page.getByRole("button", { name: "Toggle Databases Sidebar" }).click();
    }
    await expect(left).toHaveClass(leftOpen ? /open/ : /^(?!.*open)/);
    await expect(database).toHaveClass(databaseOpen ? /open/ : /^(?!.*open)/);
}

test("ordinary editor and project home follow viewport and sidebar allocation", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
        "Visible fluid content",
    ]);
    await expect(page.locator(".outliner-item", { hasText: "Visible fluid content" })).toBeVisible();

    for (const width of [1280, 1920, 2560, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await expectMainFillsAllocation(page, 32);
    }

    for (const [left, database] of [[false, false], [true, false], [false, true], [true, true]] as const) {
        await page.setViewportSize({ width: 1920, height: 900 });
        await setSidebars(page, left, database);
        await expectMainFillsAllocation(page, 32);
        const expected = 1920 - (left ? 250 : 0) - (database ? 250 : 0);
        await expect.poll(() => page.locator("#main-content").evaluate(el => el.getBoundingClientRect().width))
            .toBe(expected);
    }

    await setSidebars(page, false, false);
    await page.getByTestId("toolbar-project-name").click();
    await expect(page).toHaveURL(new RegExp(`/${encodeURIComponent(projectName)}$`));
    await expect(main(page).getByRole("heading", { name: "Page List" })).toBeVisible();
    const seededPageLink = main(page).locator(
        `a[href="/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}"]`,
    );
    await expect(seededPageLink).toHaveCount(1);
    await expect(seededPageLink).toBeVisible();
    for (const [left, database] of [[false, false], [true, false], [false, true], [true, true]] as const) {
        await setSidebars(page, left, database);
        await expectMainFillsAllocation(page, 32);
    }
    await setSidebars(page, false, false);
    for (const width of [1280, 1920, 2560, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await expectMainFillsAllocation(page, 32);
    }
    await page.setViewportSize({ width: 480, height: 800 });
    await expectMainFillsAllocation(page, 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= 480)).toBe(true);
});
