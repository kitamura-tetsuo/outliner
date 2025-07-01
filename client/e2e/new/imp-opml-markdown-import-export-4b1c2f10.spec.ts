/** @feature IMP-0001
 *  Title   : OPML/Markdown import and export
 *  Source  : docs/client-features/imp-opml-markdown-import-export-4b1c2f10.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IMP-0001: OPML/Markdown import and export", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("export markdown and opml", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.navigateToTestProjectPage(page, testInfo, [
            "Child item",
        ]);
        const encoded = encodeURIComponent(projectName);
        await page.goto(`/${encoded}/settings`);
        await expect(page.getByText("Import / Export")).toBeVisible();
        await page.click("text=Export Markdown");
        const md = await page.locator("textarea[data-testid='export-output']").inputValue();
        expect(md).toContain("Child item");
        await page.click("text=Export OPML");
        const opml = await page.locator("textarea[data-testid='export-output']").inputValue();
        expect(opml).toContain("Child item");
    });

    test("import markdown", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
        const encoded = encodeURIComponent(projectName);
        await page.goto(`/${encoded}/settings`);
        await expect(page.getByText("Import / Export")).toBeVisible();
        await page.selectOption("select", "markdown");
        const md = "- ImportedPage\n  - Child";
        await page.fill("textarea[data-testid='import-input']", md);
        await page.click("text=Import");
        await page.waitForTimeout(2000);
        await page.goto(`/${encoded}/ImportedPage`);
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemText = await page.locator(".outliner-item .item-content").first().innerText();
        expect(firstItemText).toBe("ImportedPage");
        const hasChild = await page.locator(".outliner-item", { hasText: "Child" }).count();
        expect(hasChild).toBeGreaterThan(0);
    });

    test("import opml", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
        const encoded = encodeURIComponent(projectName);
        await page.goto(`/${encoded}/settings`);
        await expect(page.getByText("Import / Export")).toBeVisible();
        const xml = "<opml><body><outline text='Imported'><outline text='Child'/></outline></body></opml>";
        await page.fill("textarea[data-testid='import-input']", xml);
        await page.click("text=Import");
        await page.waitForTimeout(2000);
        await page.goto(`/${encoded}/Imported`);
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemText = await page.locator(".outliner-item .item-content").first().innerText();
        expect(firstItemText).toBe("Imported");
        const hasChild = await page.locator(".outliner-item", { hasText: "Child" }).count();
        expect(hasChild).toBeGreaterThan(0);
    });

    test("import nested markdown", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
        const encoded = encodeURIComponent(projectName);
        await page.goto(`/${encoded}/settings`);
        await expect(page.getByText("Import / Export")).toBeVisible();
        await page.selectOption("select", "markdown");
        const md = "- Parent\n  - Child\n    - Grand";
        await page.fill("textarea[data-testid='import-input']", md);
        await page.click("text=Import");
        await page.waitForTimeout(2000);
        await page.goto(`/${encoded}/Parent`);
        await TestHelpers.waitForOutlinerItems(page);
        const grandCount = await page.locator(".outliner-item", { hasText: "Grand" }).count();
        expect(grandCount).toBeGreaterThan(0);
    });
});
