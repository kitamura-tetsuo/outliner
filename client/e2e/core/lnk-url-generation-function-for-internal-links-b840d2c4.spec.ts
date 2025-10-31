import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0001
 *  Title   : 内部リンクのURL生成機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file LNK-0001.spec.ts
 * @description 内部リンクのナビゲーション機能のテスト
 * 内部リンクのURLが正しく生成されることを確認します。
 * @playwright
 * @title 内部リンクのナビゲーション機能
 */

test.describe("LNK-0001: 内部リンクのナビゲーション機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // ブラウザコンソールの出力を取得
        page.on("console", msg => {
            if (msg.type() === "log" || msg.type() === "error") {
                console.log(`Browser ${msg.type()}: ${msg.text()}`);
            }
        });

        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    /**
     * @testcase 内部リンクのURLが正しく生成される
     * @description 内部リンクのURLが正しく生成されることを確認するテスト
     */
    test("内部リンクのURLが正しく生成される", async ({ page }) => {
        // アウトライナーアイテムが表示されるのを待つ
        await page.waitForSelector(".outliner-item", { timeout: 30000 });

        // デバッグ: アイテム数を確認
        const _itemCount = await page.locator(".outliner-item").count();
        console.log("Total outliner items:", _itemCount);

        // デバッグ: 各アイテムの存在を確認
        for (let i = 0; i < _itemCount; i++) {
            const item = page.locator(".outliner-item").nth(i);
            const exists = await item.count();
            console.log(`Item ${i} exists:`, exists);
            if (exists > 0) {
                const itemHTML = await item.innerHTML();
                console.log(`Item ${i} HTML:`, itemHTML.substring(0, 200));
            }
        }

        // 最初の編集可能なアイテムを見つける（通常は1番目のアイテム）
        const firstItem = page.locator(".outliner-item").nth(1);

        // まず、アイテムのIDを取得
        const firstItemId = await firstItem.getAttribute("data-item-id");
        console.log("First item ID:", firstItemId);

        // 実際のページ名を取得（より確実な方法）
        const actualPageName = await page.evaluate(() => {
            // まずストアから取得を試す
            const store = (window as any).store;
            if (store && store.currentPage && store.currentPage.text) {
                return store.currentPage.text;
            }

            // フォールバックとしてDOMから取得
            const pageTitle = document.querySelector(".page-title-content .item-text");
            return pageTitle ? pageTitle.textContent?.trim() : "test-page";
        });
        console.log("Actual page name:", actualPageName);

        // 従来の方法でテキスト入力を試す
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await page.waitForTimeout(100);
        await page.keyboard.type(`[${actualPageName}]`);
        await page.waitForTimeout(500);

        // テキスト入力が成功したかを確認
        console.log("Checking if text input was successful...");
        const inputSuccess = await page.evaluate(pageName => {
            const items = document.querySelectorAll(".outliner-item");
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const textContent = item.textContent || "";
                if (textContent.includes(`[${pageName}]`)) {
                    return { success: true, itemIndex: i, content: textContent };
                }
            }
            return { success: false, itemIndex: -1, content: "" };
        }, actualPageName);
        console.log("Text input result:", inputSuccess);

        if (!inputSuccess.success) {
            throw new Error(`Text input failed - [${actualPageName}] not found in any item`);
        }

        // プロジェクト内部リンクを含むテストデータをAPI経由で作成
        // 実際のページ名を取得
        const currentPageName = await page.evaluate(() => {
            const store = (window as any).store;
            if (store && store.currentPage && store.currentPage.text) {
                return store.currentPage.text;
            }

            const pageTitle = document.querySelector(".page-title-content .item-text");
            return pageTitle ? pageTitle.textContent?.trim() : "test-page";
        });

        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "一行目: テスト",
            `[${currentPageName}]`, // This will be formatted as an internal link to the current page
            "[/project-name/page-name]", // This will be formatted as a project internal link
            "3つ目のアイテム",
            "二行目: Yjs 反映",
            "三行目: 並び順チェック",
        ]);

        // We need to ensure the page is loaded and formatted, so wait a bit
        await page.waitForTimeout(1000);

        // フォーカスを外して内部リンクが正しく表示されるようにする
        await page.evaluate(() => {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === "TEXTAREA") {
                (activeElement as HTMLElement).blur();
            }
        });
        await page.waitForTimeout(1000);

        // アイテムが表示されていることを確認
        await page.waitForSelector(".outliner-item", { timeout: 5000 });

        // ScrapboxFormatterの動作をテスト
        const formatterTest = await page.evaluate(pageName => {
            // ScrapboxFormatterが利用可能かチェック
            if (typeof window.ScrapboxFormatter === "undefined") {
                return { error: "ScrapboxFormatter not available" };
            }

            const testText = `[${pageName}]`;
            const result = window.ScrapboxFormatter.formatToHtml(testText);

            return {
                input: testText,
                output: result,
                hasInternalLink: result.includes("internal-link"),
                hasHref: result.includes("href="),
            };
        }, actualPageName);
        console.log("ScrapboxFormatter test result:", formatterTest);

        // プロジェクト内部リンクのテスト
        const projectLinkTestResult = await page.evaluate(() => {
            if (typeof window.ScrapboxFormatter === "undefined") {
                return { error: "ScrapboxFormatter not available" };
            }

            const testText = `[/project-name/page-name]`;
            const result = window.ScrapboxFormatter.formatToHtml(testText);

            return {
                input: testText,
                output: result,
                hasInternalLink: result.includes("internal-link"),
                hasProjectLink: result.includes("project-link"),
                hasHref: result.includes("href="),
            };
        });
        console.log("Project link test result:", projectLinkTestResult);

        // リンクの確認を行う
        console.log("Checking for internal links...");

        // まず、要素の数を確認
        const currentItemCount = await page.locator(".outliner-item").count();
        console.log("Current item count:", currentItemCount);

        const linkCheckResult = [];

        // 各アイテムを個別に処理
        for (let i = 0; i < currentItemCount; i++) {
            const item = page.locator(".outliner-item").nth(i);

            try {
                const textContent = await item.textContent({ timeout: 5000 }) || "";
                const itemTextCount = await item.locator(".item-text").count();
                let itemTextHTML = "";

                if (itemTextCount > 0) {
                    try {
                        itemTextHTML = await item.locator(".item-text").innerHTML({ timeout: 5000 });
                    } catch (error) {
                        console.log(`Failed to get .item-text HTML for item ${i}:`, error);
                    }
                }

                const result = {
                    index: i,
                    textContent: textContent.substring(0, 100),
                    hasItemText: itemTextCount > 0,
                    itemTextHTML: itemTextHTML, // 完全なHTMLを保持
                    hasTestPageText: textContent.includes(`[${actualPageName}]`)
                        || textContent.includes(actualPageName),
                    hasProjectPageText: textContent.includes("[/project-name/page-name]")
                        || textContent.includes("project-name/page-name"),
                    hasInternalLink: itemTextHTML.includes("internal-link"),
                    hasHref: itemTextHTML.includes("href="),
                };

                console.log(`Item ${i}:`, result);
                linkCheckResult.push(result);
            } catch (error) {
                console.log(`Failed to process item ${i}:`, error);
                linkCheckResult.push({
                    index: i,
                    textContent: "Failed to get content",
                    hasItemText: false,
                    itemTextHTML: "",
                    hasTestPageText: false,
                    hasProjectPageText: false,
                    hasInternalLink: false,
                    hasHref: false,
                });
            }
        }

        console.log("Link check results:", JSON.stringify(linkCheckResult, null, 2));

        // 内部リンクが正しく生成されているアイテムを確認
        const linkItemResult = linkCheckResult.find(r => r.hasTestPageText && r.hasInternalLink);
        if (linkItemResult) {
            console.log("Found item with internal link:", linkItemResult);
            expect(linkItemResult.itemTextHTML).toContain("internal-link");
            expect(linkItemResult.itemTextHTML).toContain(actualPageName);
            expect(linkItemResult.itemTextHTML).toContain(`href="/${actualPageName}"`);
        } else {
            // 内部リンクが見つからない場合、詳細情報を表示
            const itemsWithTestPage = linkCheckResult.filter(r => r.hasTestPageText);
            console.log("Items with test page text but no internal link:", itemsWithTestPage);
            throw new Error(`No item found with internal link for [${actualPageName}]`);
        }

        // 2番目のアイテムで内部リンクが正しく生成されているかを確認
        // プロジェクト内部リンクが正しく生成されているか、HTML要素を確認
        const projectLinkExists = await page.evaluate(() => {
            // ページ全体を検索して、href="/project-name/page-name" というリンクが存在するか確認
            const links = document.querySelectorAll("a.internal-link");
            for (const link of links) {
                if (
                    link.getAttribute("href") === "/project-name/page-name"
                    && link.textContent?.includes("project-name/page-name")
                ) {
                    return true;
                }
            }
            return false;
        });

        if (projectLinkExists) {
            console.log("Found project internal link with href='/project-name/page-name'");
        } else {
            throw new Error("No project internal link found with href='/project-name/page-name'");
        }
    });

    /**
     * @testcase 内部リンクのHTMLが正しく生成される
     * @description 内部リンクのHTMLが正しく生成されることを確認するテスト
     */
    test("内部リンクのHTMLが正しく生成される", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[placeholder]",
            "[/project-name/page-name]",
            "3つ目のアイテム",
        ]);

        await page.waitForSelector(".outliner-item", { timeout: 30000 });

        await page.evaluate(dynamicPageName => {
            const store = (window as any).generalStore || (window as any).appStore;
            const items = store?.currentPage?.items;
            if (!items) return;
            const firstItem = items.at ? items.at(0) : (items as any)[0];
            if (firstItem && typeof firstItem.updateText === "function") {
                firstItem.updateText(`[${dynamicPageName}]`);
            }
        }, pageName);

        await page.waitForTimeout(300);
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(300);

        const internalLink = page.locator(".item-text a.internal-link").filter({ hasText: pageName }).first();
        await expect(internalLink).toBeVisible({ timeout: 5000 });
        await expect(internalLink).toHaveAttribute("href", `/${pageName}`);

        const internalLinkParentClass = await internalLink.evaluate(node => node.parentElement?.className ?? "");
        expect(internalLinkParentClass).toContain("link-preview-wrapper");

        const projectLink = page.locator('a.internal-link.project-link[href="/project-name/page-name"]');
        await expect(projectLink).toBeVisible({ timeout: 5000 });
        await expect(projectLink).toHaveText("project-name/page-name");

        const projectLinkClass = await projectLink.getAttribute("class");
        expect(projectLinkClass).toContain("internal-link");
        expect(projectLinkClass).toContain("project-link");

        const projectLinkDataset = await projectLink.evaluate(node => ({
            project: node.getAttribute("data-project"),
            page: node.getAttribute("data-page"),
        }));
        expect(projectLinkDataset.project).toBe("project-name");
        expect(projectLinkDataset.page).toBe("page-name");
    });
});
