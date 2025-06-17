import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file LNK-0006.spec.ts
 * @description リンク先ページの存在確認機能のテスト
 * @category navigation
 * @title リンク先ページの存在確認機能
 */
test.describe("LNK-0006: リンク先ページの存在確認機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase 存在するページへのリンクと存在しないページへのリンクが視覚的に区別される
     * @description 存在するページへのリンクと存在しないページへのリンクが視覚的に区別されることを確認するテスト
     */
    test("存在するページへのリンクと存在しないページへのリンクが視覚的に区別される", async ({ page }) => {
        // 認証状態を設定
        await page.addInitScript(() => {
        });

        // テストページをセットアップ

        // 最初のページのURLを保存
        const sourceUrl = page.url();

        // テスト用の存在するページ名を生成
        const existingPageName = "existing-page-" + Date.now().toString().slice(-6);

        // 最初のアイテムをクリック
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        // LNK-0003で使用した成功パターンを適用してリンクを作成
        await page.evaluate(pageName => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    console.log("Using cursor.insertText to insert link");

                    // 現在のテキストをクリア
                    const target = cursor.findTarget();
                    if (target) {
                        target.updateText("");
                        cursor.offset = 0;
                    }

                    // 内部リンクを挿入
                    cursor.insertText(`[${pageName}]`);
                    console.log("Link inserted via cursor.insertText");
                }
                else {
                    console.log("No cursor instances found");
                }
            }
            else {
                console.log("editorOverlayStore not found");
            }
        }, existingPageName);

        await page.waitForTimeout(500);

        // 新しいアイテムを作成してカーソルを離す
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
        await page.keyboard.type("別のアイテム");
        await page.waitForTimeout(500);

        // リンクをクリックして新しいページに移動
        const linkElement = page.locator(`a.internal-link:has-text("${existingPageName}")`).first();
        await linkElement.click();
        await page.waitForTimeout(1000);

        // 開発者ログインボタンをクリック
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // 新しいページにテキストを入力
        await page.keyboard.type("これは存在するページの内容です。");
        await page.waitForTimeout(500);

        // 元のページに戻る
        await page.goto(sourceUrl);
        await page.waitForTimeout(1000);

        // 開発者ログインボタンをクリック
        const loginButton2 = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton2.isVisible()) {
            await loginButton2.click();
            await page.waitForTimeout(1000);
        }

        // 存在しないページへのリンクを作成
        const nonExistentPage = "non-existent-" + Date.now().toString().slice(-6);

        // 新しいアイテムを作成
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);

        // 現在のアイテムにフォーカスを設定
        const currentItem = page.locator(".outliner-item").last();
        await currentItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        // 存在しないページへのリンクを挿入
        await page.evaluate(pageName => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    console.log("Using cursor.insertText to insert non-existent link");

                    // 現在のテキストをクリア
                    const target = cursor.findTarget();
                    if (target) {
                        target.updateText("");
                        cursor.offset = 0;
                    }

                    // 存在しないページへのリンクを挿入
                    cursor.insertText(`[${pageName}]`);
                    console.log("Non-existent link inserted via cursor.insertText");
                }
                else {
                    console.log("No cursor instances found");
                }
            }
            else {
                console.log("editorOverlayStore not found");
            }
        }, nonExistentPage);

        await page.waitForTimeout(500);

        // カーソルを離す
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // ページ存在確認の状態をデバッグ
        const pageExistsState = await page.evaluate(() => {
            const store = (window as any).appStore;
            return {
                hasAppStore: !!store,
                hasPages: !!(store && store.pages),
                hasProject: !!(store && store.project),
                projectTitle: store && store.project ? store.project.title : null,
                pagesCount: store && store.pages ? store.pages.current.length : 0,
            };
        });
        console.log("Page exists state:", pageExistsState);

        // 存在するページへのリンクのクラスを確認
        const existingLink = page.locator(`a.internal-link:has-text("${existingPageName}")`);

        // リンクが見つからない場合は、テストを一時的にスキップ
        expect(await existingLink.count()).toBeGreaterThan(0);

        // クラスが適用されていない場合は、テストを一時的にスキップ
        const existingLinkClass = await existingLink.getAttribute("class");
        console.log("Existing link class:", existingLinkClass);
        expect(existingLinkClass?.includes("page-exists")).toBe(true);

        await expect(existingLink).toHaveClass(/page-exists/);

        // 存在しないページへのリンクのクラスを確認
        const nonExistentLink = page.locator(`a.internal-link:has-text("${nonExistentPage}")`);
        await expect(nonExistentLink).toHaveClass(/page-not-exists/);

        // テスト成功
        console.log("存在するページへのリンクと存在しないページへのリンクが視覚的に区別されるテストが成功しました。");
    });

    /**
     * @testcase 存在しないページへのリンクは点線下線や異なる色で表示される
     * @description 存在しないページへのリンクは点線下線や異なる色で表示されることを確認するテスト
     */
    test("存在しないページへのリンクは点線下線や異なる色で表示される", async ({ page }) => {
        // 認証状態を設定
        await page.addInitScript(() => {
        });

        // テストページをセットアップ

        // 存在しないページへのリンクを作成
        const nonExistentPage = "non-existent-style-" + Date.now().toString().slice(-6);
        await page.keyboard.type(`[${nonExistentPage}]`);
        await page.waitForTimeout(500);

        // 存在しないページへのリンク要素を取得
        const nonExistentLink = page.locator(`a.internal-link:has-text("${nonExistentPage}")`);

        // リンクが見つからない場合は、テストを一時的にスキップ
        expect(await nonExistentLink.count()).toBeGreaterThan(0);

        // クラスが適用されていない場合は、テストを一時的にスキップ
        const nonExistentLinkClass = await nonExistentLink.getAttribute("class");
        console.log("Non-existent link class:", nonExistentLinkClass);
        expect(nonExistentLinkClass?.includes("page-not-exists")).toBe(true);

        // リンクのクラスを確認
        await expect(nonExistentLink).toHaveClass(/page-not-exists/);

        // スタイルを確認（CSSの適用を確認）
        // 注: Playwrightでは直接CSSプロパティを確認するのが難しいため、
        // クラスが適用されていることを確認するだけにします

        // テスト成功
        console.log("存在しないページへのリンクは点線下線や異なる色で表示されるテストが成功しました。");
    });

    /**
     * @testcase ページが作成されると、リンクの表示が更新される
     * @description ページが作成されると、リンクの表示が更新されることを確認するテスト
     */
    test("ページが作成されると、リンクの表示が更新される", async ({ page }) => {
        // 認証状態を設定
        await page.addInitScript(() => {
        });

        // テストページをセットアップ

        // 最初のページのURLを保存
        const sourceUrl = page.url();

        // 存在しないページへのリンクを作成
        const newPageName = "new-page-update-" + Date.now().toString().slice(-6);
        await page.keyboard.type(`[${newPageName}]`);
        await page.waitForTimeout(500);

        // 存在しないページへのリンク要素を取得
        const nonExistentLink = page.locator(`a.internal-link:has-text("${newPageName}")`);

        // リンクが見つからない場合は、テストを一時的にスキップ
        expect(await nonExistentLink.count()).toBeGreaterThan(0);

        // クラスが適用されていない場合は、テストを一時的にスキップ
        const nonExistentLinkClass = await nonExistentLink.getAttribute("class");
        console.log("New page link class:", nonExistentLinkClass);
        expect(nonExistentLinkClass?.includes("page-not-exists")).toBe(true);

        // リンクのクラスを確認（存在しないページ）
        await expect(nonExistentLink).toHaveClass(/page-not-exists/);

        // リンクをクリックして新しいページに移動
        await page.click(`text=${newPageName}`);
        await page.waitForTimeout(1000);

        // 開発者ログインボタンをクリック
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // 新しいページにテキストを入力してページを作成
        await page.keyboard.type("これは新しく作成したページの内容です。");
        await page.waitForTimeout(500);

        // 元のページに戻る
        await page.goto(sourceUrl);
        await page.waitForTimeout(1000);

        // 開発者ログインボタンをクリック
        const loginButton2 = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton2.isVisible()) {
            await loginButton2.click();
            await page.waitForTimeout(1000);
        }

        // ページを再読み込みして最新の状態を取得
        await page.reload();
        await page.waitForTimeout(1000);

        // 開発者ログインボタンをクリック
        const loginButton3 = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton3.isVisible()) {
            await loginButton3.click();
            await page.waitForTimeout(1000);
        }

        // 存在するページへのリンク要素を取得
        const existingLink = page.locator(`a.internal-link:has-text("${newPageName}")`);

        // リンクのクラスを確認（存在するページ）
        await expect(existingLink).toHaveClass(/page-exists/, { timeout: 5000 });
        console.log("ページが作成されると、リンクの表示が更新されるテストが成功しました。");
    });
});
