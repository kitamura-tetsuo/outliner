import { type Browser, expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

let ids: { projectName: string; pageName: string; };
let page: Page;

test.beforeEach(async ({ page: initialPage, browser }, testInfo) => {
    const result = await TestHelpers.prepareTestEnvironment(initialPage, testInfo, [], browser);
    ids = { projectName: result.projectName, pageName: result.pageName };
    page = result.page;
});

test("displays outline page after environment setup", async () => {
    const encodedProject = encodeURIComponent(ids.projectName);
    const encodedPage = encodeURIComponent(ids.pageName);

    await expect(page).toHaveURL(new RegExp(`/${encodedProject}/${encodedPage}$`));
    await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();

    await TestHelpers.waitForOutlinerItems(page);
});

test("shows search box and at least one outliner item", async () => {
    // verify search box in main toolbar is visible
    const searchInput = page
        .getByTestId("main-toolbar")
        .getByRole("textbox", { name: "Search pages" });
    await expect(searchInput).toBeVisible();

    // ensure at least one outliner item is rendered
    const items = page.locator(".outliner-item");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    await expect(items.first()).toBeVisible();
});

test("displays breadcrumb with project and page names", async () => {
    const breadcrumb = page.locator("nav");
    await expect(breadcrumb).toContainText(ids.projectName);
    await expect(breadcrumb).toContainText(ids.pageName);
});

test("allows editing the first outliner item", async () => {
    await TestHelpers.waitForOutlinerItems(page);
    const firstItem = page.locator(".outliner-item").first();
    await firstItem.click();
    await page.keyboard.type("Hello");
    await expect(firstItem).toContainText("Hello");
});

test("creates a new outliner item when pressing Enter", async () => {
    await TestHelpers.waitForOutlinerItems(page);
    const items = page.locator(".outliner-item");
    const initialCount = await items.count();

    await items.last().click();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second item");

    await TestHelpers.waitForOutlinerItems(page);
    await expect(items).toHaveCount(initialCount + 1);
    await expect(items.nth(initialCount)).toContainText("Second item");
});

test("adds multiple outliner items sequentially with Enter", async () => {
    await TestHelpers.waitForOutlinerItems(page);
    const items = page.locator(".outliner-item");
    const startCount = await items.count();

    await items.last().click();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Third");

    await TestHelpers.waitForOutlinerItems(page);
    await expect(items).toHaveCount(startCount + 2);
    await expect(items.nth(startCount)).toContainText("Second");
    await expect(items.nth(startCount + 1)).toContainText("Third");
});
