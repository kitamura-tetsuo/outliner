/** @feature IMP-0001
 *  Title   : OPML/Markdown import and export
 *  Source  : docs/client-features/imp-opml-markdown-import-export-4b1c2f10.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

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
        await page.selectOption("select[data-testid='import-format-select']", "markdown");
        const md = "- ImportedPage\n  - Child";
        await page.fill("textarea[data-testid='import-input']", md);

        // インポート前の状態を確認
        const selectedFormat = await page.locator("select[data-testid='import-format-select']").inputValue();
        const inputText = await page.locator("textarea[data-testid='import-input']").inputValue();
        console.log("Selected format:", selectedFormat);
        console.log("Input text:", inputText);

        // ブラウザのコンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on("console", msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });

        const importButton = page.locator("button", { hasText: "Import" });
        await expect(importButton).toBeVisible();
        await importButton.click();
        console.log("Import button clicked");
        await page.waitForTimeout(2000);

        // インポート後のプロジェクト状態を確認
        const projectTreeData = await TreeValidator.getTreeData(page);
        console.log("Project tree data after import:", JSON.stringify(projectTreeData, null, 2));
        console.log("Browser console logs:", consoleLogs);

        await page.goto(`/${encoded}/ImportedPage`);
        await TestHelpers.waitForOutlinerItems(page);

        // ページ表示後のツリーデータを確認
        const pageTreeData = await TreeValidator.getTreeData(page);
        console.log("Page tree data after navigation:", JSON.stringify(pageTreeData, null, 2));

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

        // インポート前の状態を確認
        const selectedFormat = await page.locator("select[data-testid='import-format-select']").inputValue();
        const inputText = await page.locator("textarea[data-testid='import-input']").inputValue();
        console.log("Selected format:", selectedFormat);
        console.log("Input text:", inputText);

        // ブラウザのコンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on("console", msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });

        const importButton = page.locator("button", { hasText: "Import" });
        await expect(importButton).toBeVisible();
        await importButton.click();
        console.log("Import button clicked");
        await page.waitForTimeout(2000);

        // インポート後のプロジェクト状態を確認
        const projectTreeData = await TreeValidator.getTreeData(page);
        console.log("Project tree data after import:", JSON.stringify(projectTreeData, null, 2));
        console.log("Browser console logs:", consoleLogs);

        await page.goto(`/${encoded}/Imported`);
        await TestHelpers.waitForOutlinerItems(page);

        // ページ表示後のツリーデータを確認
        const pageTreeData = await TreeValidator.getTreeData(page);
        console.log("Page tree data after navigation:", JSON.stringify(pageTreeData, null, 2));

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
        await page.selectOption("select[data-testid='import-format-select']", "markdown");
        const md = "- Parent\n  - Child\n    - Grand";
        await page.fill("textarea[data-testid='import-input']", md);

        // インポートボタンをクリックする前の状態を確認
        console.log("Before clicking import button");
        const importButton = page.locator("button", { hasText: "Import" });
        await expect(importButton).toBeVisible();
        console.log("Import button is visible");

        // ブラウザのコンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on("console", msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });

        await importButton.click();
        console.log("Import button clicked");
        await page.waitForTimeout(2000);

        // インポート後のプロジェクト状態を確認
        const projectTreeData = await TreeValidator.getTreeData(page);
        console.log("Project tree data after import:", JSON.stringify(projectTreeData, null, 2));

        // プロジェクトページに戻って、ページリストを確認
        await page.goto(`/${encoded}`);
        await page.waitForTimeout(1000);

        // ページリストを確認
        const pageLinks = await page.locator('a[href*="/"]').allTextContents();
        console.log("Available pages:", pageLinks);

        await page.goto(`/${encoded}/Parent`);
        await TestHelpers.waitForOutlinerItems(page);

        // SharedTreeの状態を確認
        const treeData = await TreeValidator.getTreeData(page);
        console.log("Tree data after import:", JSON.stringify(treeData, null, 2));

        // コンソールログを確認
        console.log("Browser console logs:", consoleLogs);

        const grandCount = await page.locator(".outliner-item", { hasText: "Grand" }).count();
        expect(grandCount).toBeGreaterThan(0);
    });
});
