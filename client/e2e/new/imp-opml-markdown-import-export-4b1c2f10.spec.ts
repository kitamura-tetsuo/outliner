import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IMP-0001
 *  Title   : OPML/Markdown import and export
 *  Source  : docs/client-features/imp-opml-markdown-import-export-4b1c2f10.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("IMP-0001: OPML/Markdown import and export", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("export markdown and opml", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "Child item",
        ]);
        const encoded = encodeURIComponent(projectName);
        await page.goto(`/${encoded}/settings`);
        await expect(page.getByText("Import / Export")).toBeVisible();

        // Setup debugger functions on the new page
        await TestHelpers.setupTreeDebugger(page);

        // Wait for the project data to be loaded via Yjs after navigation
        await page.waitForFunction(() => {
            const data = (window as any).getYjsTreeDebugData();
            if (!data || !data.items || data.items.length === 0) {
                return false;
            }
            const page = data.items[0]; // The first page
            return page && page.items && page.items.length > 0;
        });

        await page.click("text=Export Markdown");
        const md = await page.locator("textarea[data-testid='export-output']").inputValue();
        expect(md).toContain("Child item");
        await page.click("text=Export OPML");
        const opml = await page.locator("textarea[data-testid='export-output']").inputValue();
        expect(opml).toContain("Child item");
    });

    test("import markdown", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo, []);
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

        console.log("Browser console logs:", consoleLogs);

        await page.goto(`/${encoded}/ImportedPage`);

        // Wait for Yjs connection and page items to be loaded
        // This is necessary because page navigation and Yjs sync may take time
        await page.waitForFunction(
            () => {
                const yjsStore = (window as any).__YJS_STORE__;
                const isConnected = yjsStore?.getIsConnected?.() === true;
                if (!isConnected) return false;

                // Check if page items exist
                const items = document.querySelectorAll(".outliner-item[data-item-id]");
                return items.length >= 2; // ImportedPage + Child
            },
            null,
            { timeout: 30000 },
        ).catch(() => {
            console.log("Warning: Yjs not connected or page items not loaded within timeout");
        });

        await TestHelpers.waitForOutlinerItems(page);

        // Wait for the "Child" item to appear - Yjs sync may take time
        await page.locator(".outliner-item", { hasText: "Child" }).waitFor({ timeout: 15000 }).catch(() => {
            console.log("Warning: 'Child' item not found within timeout, continuing with test");
        });

        // ページ表示後のツリーデータを確認
        const pageTreeData = await TreeValidator.getTreeData(page);
        console.log("Page tree data after navigation:", JSON.stringify(pageTreeData, null, 2));

        const textContents = await page.locator(".outliner-item .item-content").allTextContents();
        console.log("Outliner item texts:", textContents);

        const firstItemText = await page.locator(".outliner-item .item-content").first().innerText();
        expect(firstItemText).toBe("ImportedPage");
        const hasChild = await page.locator(".outliner-item", { hasText: "Child" }).count();
        expect(hasChild).toBeGreaterThan(0);
    });

    test("import opml", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo, []);
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

        console.log("Browser console logs:", consoleLogs);

        await page.goto(`/${encoded}/Imported`);

        // Wait for Yjs connection and page items to be loaded
        await page.waitForFunction(
            () => {
                const yjsStore = (window as any).__YJS_STORE__;
                const isConnected = yjsStore?.getIsConnected?.() === true;
                if (!isConnected) return false;

                // Check if page items exist
                const items = document.querySelectorAll(".outliner-item[data-item-id]");
                return items.length >= 2; // Imported + Child
            },
            null,
            { timeout: 30000 },
        ).catch(() => {
            console.log("Warning: Yjs not connected or page items not loaded within timeout");
        });

        await TestHelpers.waitForOutlinerItems(page);

        // Wait for the "Child" item to appear
        await page.locator(".outliner-item", { hasText: "Child" }).waitFor({ timeout: 15000 }).catch(() => {
            console.log("Warning: 'Child' item not found within timeout, continuing with test");
        });

        // ページ表示後のツリーデータを確認
        const pageTreeData = await TreeValidator.getTreeData(page);
        console.log("Page tree data after navigation:", JSON.stringify(pageTreeData, null, 2));

        const firstItemText = await page.locator(".outliner-item .item-content").first().innerText();
        expect(firstItemText).toBe("Imported");
        const hasChild = await page.locator(".outliner-item", { hasText: "Child" }).count();
        expect(hasChild).toBeGreaterThan(0);
    });

    test("import nested markdown", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo, []);
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

        // プロジェクトページに戻って、ページリストを確認
        await page.goto(`/${encoded}`);
        await TestHelpers.waitForUIStable(page);

        // ページリストを確認
        const pageLinks = await page.locator('a[href*="/"]').allTextContents();
        console.log("Available pages:", pageLinks);

        await page.goto(`/${encoded}/Parent`);

        // Wait for Yjs connection and page items to be loaded
        await page.waitForFunction(
            () => {
                const yjsStore = (window as any).__YJS_STORE__;
                const isConnected = yjsStore?.getIsConnected?.() === true;
                if (!isConnected) return false;

                // Check if page items exist
                const items = document.querySelectorAll(".outliner-item[data-item-id]");
                return items.length >= 1; // At least Parent
            },
            null,
            { timeout: 30000 },
        ).catch(() => {
            console.log("Warning: Yjs not connected or page items not loaded within timeout");
        });

        await TestHelpers.waitForOutlinerItems(page);

        // SharedTreeの状態を確認
        const treeData = await TreeValidator.getTreeData(page);
        console.log("Tree data after import:", JSON.stringify(treeData, null, 2));

        // コンソールログを確認
        console.log("Browser console logs:", consoleLogs);

        // Wait for items to be visible and check what's actually on the page
        const allItems = await page.locator(".outliner-item").allTextContents();
        console.log("All outliner items on page:", allItems);

        // Check if Child item exists and try to expand it if collapsed
        const childItem = page.locator(".outliner-item", { hasText: "Child" });
        const childCount = await childItem.count();
        console.log("Child item count:", childCount);

        if (childCount > 0) {
            // Check if there's a collapse button and click it to expand
            const collapseBtn = childItem.locator(".collapse-btn").first();
            const collapseBtnCount = await collapseBtn.count();
            console.log("Collapse button count:", collapseBtnCount);

            if (collapseBtnCount > 0) {
                const btnText = await collapseBtn.textContent();
                console.log("Collapse button text:", btnText);
                if (btnText === "▶") {
                    console.log("Expanding Child item");
                    await collapseBtn.click();
                    await TestHelpers.waitForUIStable(page);
                }
            }
        }

        const grandCount = await page.locator(".outliner-item", { hasText: "Grand" }).count();
        console.log("Grand item count:", grandCount);
        expect(grandCount).toBeGreaterThan(0);
    });
});
