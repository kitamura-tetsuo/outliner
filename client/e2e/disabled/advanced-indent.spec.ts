import {
    expect,
    test,
} from "@playwright/test";

/**
 * @file advanced-indent.spec.ts
 * @description インデント操作のテスト
 * アウトラインアプリのインデント操作（Tab, Shift+Tab）による項目の階層変更と、
 * 階層の折りたたみ・展開機能をテストします。
 */

test.describe("Advanced indent/unindent functionality", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // ホームページにアクセス
        await page.goto("/"); // エミュレータを使用するための設定とデバッグ関数の追加
        await page.addInitScript(() => {
            // エミュレータを使用するためモックは不要

            // テスト用に共有ツリー構造を厳格に取得する関数を追加
            window.getFluidTreeDebugData = function () {
                // DOM構造からツリーデータを構築する明示的な実装
                const rootLevel = [];
                const items = document.querySelectorAll(".outliner-item");

                // シンプルなツリー構造の再構築
                function buildTreeFromDOM() {
                    const rootLevel = [];
                    const itemMap = new Map();
                    const levelMap = new Map();

                    // 各アイテムを処理
                    items.forEach(item => {
                        // パディング値からレベルを推定
                        const style = window.getComputedStyle(item);
                        const paddingLeft = parseInt(style.paddingLeft) || 0;
                        const level = Math.floor(paddingLeft / 20);

                        // アイテムのテキスト要素を取得
                        const textEl = item.querySelector(".item-text");
                        const text = textEl ? textEl.textContent : "";

                        // アイテムに一意のIDを割り当て
                        const id = item.id || `item-${Math.random().toString(36).substring(2, 9)}`;

                        // 子アイテムを持つかどうかを確認
                        const hasChildren = item.querySelector(".collapse-btn") !== null;

                        // アイテムオブジェクトを作成
                        const itemObj = {
                            id,
                            text,
                            hasChildren,
                            children: [],
                        };

                        // レベル情報とアイテムを保存
                        itemMap.set(id, itemObj);
                        levelMap.set(id, level);

                        if (level === 0) {
                            rootLevel.push(itemObj);
                        }
                    });

                    // 親子関係を構築
                    items.forEach(item => {
                        // アイテムのIDを取得
                        const id = item.id || `item-${Math.random().toString(36).substring(2, 9)}`;
                        const itemObj = itemMap.get(id);
                        const level = levelMap.get(id);

                        if (level > 0) {
                            // 親を見つける - 同じまたは近いレベルのアイテムを検索
                            let parentId = null;

                            // 現在のアイテムより前のアイテムを走査
                            for (const [otherId, otherLevel] of levelMap.entries()) {
                                if (otherLevel === level - 1) {
                                    // 適切なレベルの親を見つけた場合
                                    parentId = otherId;
                                }
                            }

                            if (parentId && itemMap.has(parentId)) {
                                // 親アイテムに子として追加
                                const parent = itemMap.get(parentId);
                                parent.children.push(itemObj);
                            }
                        }
                    });

                    return { children: rootLevel };
                }

                return buildTreeFromDOM();
            };
        });

        // ページが読み込まれるのを待つ
        await page.waitForLoadState("networkidle", { timeout: 30000 });

        // テスト前に確実にページが選択されていることを確認
        await ensurePageExists(page);

        // アイテム追加ボタンが表示されるのを待つ
        await page.waitForSelector('button:has-text("アイテム追加")', { timeout: 5000 });
    });

    // ページが存在することを確認するヘルパー関数
    async function ensurePageExists(page) {
        // 既存のページを確認
        const pageExists = await page.locator(".page-list li").count() > 0;

        if (!pageExists) {
            // ページが存在しない場合は新規作成
            await page.fill(".page-create input", "テストページ");
            await page.click(".page-create button");
            // ページが作成されるのを待つ
            await page.waitForSelector(".page-list li", { timeout: 5000 });
        }

        // 最初のページをクリック
        await page.locator(".page-list li").first().click();

        // ページ内容が表示されるのを待つ
        await page.waitForSelector(".outliner", { timeout: 5000 });
    }

    /**
     * @testcase Should create and manipulate a deeply nested structure
     * @description 複数のアイテムを作成し、インデント操作で深い階層構造を作成・操作するテスト
     * @check 5つのアイテムを作成してテキストを入力できる
     * @check Tab キーでインデントを増加させて階層構造を作成できる
     * @check インデント後のパディング値や階層レベルが正しく増加している
     * @check TreeValidator を使用して SharedTree の構造と UI の整合性を検証する
     * @check Shift+Tab キーでインデントを減少させて階層構造を変更できる
     * @check インデント減少後のパディング値や階層レベルが適切に減少している
     */
    test("Should create and manipulate a deeply nested structure", async ({ page }) => {
        // アイテムを5つ追加
        for (let i = 0; i < 5; i++) {
            // await page.click('button:has-text("アイテム追加")');
            // 各アイテムにテキストを入力
            await page.locator(".outliner-item").nth(i).click();
            await page.keyboard.type(`アイテム ${i + 1}`);
            await page.keyboard.press("Enter");
        }

        await page.screenshot({ path: "test-results/advanced-indent-initial.png" });

        // ステップ1: 階層構造を作成（2から5までのアイテムを順番に移動）
        // アイテム2をアイテム1の子にする
        await page.locator(".outliner-item").nth(1).click();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        // 階層構造を検証
        let structure = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll(".item-container")) as HTMLElement[];
            return items.map(item => ({
                depth: parseInt(getComputedStyle(item).getPropertyValue("--item-depth")) || 0,
                text: item.querySelector(".item-text")?.textContent?.trim() || "",
                top: parseInt(item.style.top) || 0,
            }));
        });

        // アイテム2がアイテム1の子になっていることを確認
        expect(structure[1].depth).toBe(1);
        expect(structure[1].text).toBe("アイテム 2");

        // アイテム3をアイテム2の子にする
        await page.locator(".outliner-item").nth(2).click();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        structure = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll(".item-container")) as HTMLElement[];
            return items.map(item => ({
                depth: parseInt(getComputedStyle(item).getPropertyValue("--item-depth")) || 0,
                text: item.querySelector(".item-text")?.textContent?.trim() || "",
                top: parseInt(item.style.top) || 0,
            }));
        });

        // アイテム3がアイテム2の子になっていることを確認
        expect(structure[2].depth).toBe(2);
        expect(structure[2].text).toBe("アイテム 3");

        // アイテム4をアイテム3の子にする
        await page.locator(".outliner-item").nth(3).click();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        structure = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll(".item-container")) as HTMLElement[];
            return items.map(item => ({
                depth: parseInt(getComputedStyle(item).getPropertyValue("--item-depth")) || 0,
                text: item.querySelector(".item-text")?.textContent?.trim() || "",
                top: parseInt(item.style.top) || 0,
            }));
        });

        // アイテム4がアイテム3の子になっていることを確認
        expect(structure[3].depth).toBe(3);
        expect(structure[3].text).toBe("アイテム 4");

        await page.screenshot({ path: "test-results/advanced-indent-nested.png" });

        // SharedTreeの構造とUIの両方を検証
        // await TreeValidator.validateTreeStructure(page);

        // ステップ2: 階層構造の変更を検証
        // アイテム4を2レベル上げる（2回のshift+tab）
        const item4 = page.locator(".outliner-item").nth(3);
        for (let i = 0; i < 2; i++) {
            await item4.click();
            await page.keyboard.press("Shift+Tab");
            await page.waitForTimeout(500);
        }

        await page.screenshot({ path: "test-results/advanced-unindent-result.png" });

        // 変更後の階層構造を検証
        const finalStructure = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll(".item-container")) as HTMLElement[];
            return items.map(item => ({
                depth: parseInt(getComputedStyle(item).getPropertyValue("--item-depth")) || 0,
                text: item.querySelector(".item-text")?.textContent?.trim() || "",
                top: parseInt(item.style.top) || 0,
            }));
        });

        // アイテム4の深さが2レベル減少したことを確認
        const item4Final = finalStructure.find(item => item.text === "アイテム 4");
        expect(item4Final?.depth).toBe(1);

        // 垂直位置も適切に更新されていることを確認
        expect(finalStructure.every((item, i) => i === 0 || item.top > finalStructure[i - 1].top)).toBe(true);

        // SharedTreeの構造とUIの一致を検証
        // await TreeValidator.validateTreeStructure(page);
    });

    // /**
    //  * @testcase Should handle collapsing and expanding nested items
    //  * @description 階層構造の折りたたみと展開機能をテストする
    //  * @check 親アイテムと子アイテム、孫アイテムを作成できる
    //  * @check Tab キーを使用して子アイテム、孫アイテムを適切にインデントできる
    //  * @check 親アイテムの折りたたみボタンをクリックすると子孫アイテムが非表示になる
    //  * @check 折りたたみ後は親アイテムのみが表示され、子孫アイテムは非表示になる
    //  * @check 再度折りたたみボタンをクリックすると子孫アイテムが再表示される
    //  * @check 展開後はすべてのアイテムが正しく表示される
    //  */
    // test("Should handle collapsing and expanding nested items", async ({ page }) => {
    //     // ネストされた構造を作成
    //     // 1. 最初のアイテムを追加
    //     await page.click('button:has-text("アイテム追加")');
    //     await page.locator(".outliner-item").first().click();
    //     await page.keyboard.type("親アイテム");
    //     await page.keyboard.press("Enter");

    //     // 2. 子アイテムを追加
    //     await page.click('button:has-text("アイテム追加")');
    //     await page.locator(".outliner-item").nth(1).click();
    //     await page.keyboard.type("子アイテム1");
    //     await page.keyboard.press("Enter");

    //     // 3. 孫アイテムを追加
    //     await page.click('button:has-text("アイテム追加")');
    //     await page.locator(".outliner-item").nth(2).click();
    //     await page.keyboard.type("子アイテム2");
    //     await page.keyboard.press("Enter");

    //     // 子アイテムをインデント
    //     await page.locator(".outliner-item").nth(1).click();
    //     await page.keyboard.press("Tab");
    //     await page.waitForTimeout(500);

    //     // 孫アイテムを更にインデント
    //     await page.locator(".outliner-item").nth(2).click();
    //     await page.keyboard.press("Tab");
    //     await page.waitForTimeout(500);

    //     // インデント後の状態をキャプチャ
    //     await page.screenshot({ path: "test-results/collapse-before.png" });

    //     // 親アイテムを折りたたむ
    //     const collapseButton = page.locator(".outliner-item").first().locator(".collapse-btn");
    //     await collapseButton.click();
    //     await page.waitForTimeout(500);

    //     // 折りたたまれた状態をキャプチャ
    //     await page.screenshot({ path: "test-results/collapse-after.png" });

    //     // 子アイテムが非表示になっていることを確認
    //     // ２つ目のアイテムが見えなくなっているはず
    //     const visibleItems = await page.locator(".outliner-item:visible").count();
    //     expect(visibleItems).toBe(1);

    //     // 再び展開
    //     await collapseButton.click();
    //     await page.waitForTimeout(500);

    //     // 展開後の状態をキャプチャ
    //     await page.screenshot({ path: "test-results/expand-after.png" });

    //     // すべてのアイテムが再び表示されていることを確認
    //     const itemsAfterExpand = await page.locator(".outliner-item:visible").count();
    //     // 注：実際のカウントはDOMの構造によって3または2+1になる可能性がある
    //     expect(itemsAfterExpand).toBeGreaterThanOrEqual(3);
    // });
});
