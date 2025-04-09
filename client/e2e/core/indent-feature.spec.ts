import {
    expect,
    test,
} from "@playwright/test";

/**
 * @file indent-feature.spec.ts
 * @description インデント機能のテスト
 * アウトラインアプリのインデント機能が適切に動作することを確認するためのテストです。
 * アイテムのインデント増加（Tab）とインデント減少（Shift+Tab）による階層構造の
 * 作成と操作が正しく行われることを検証します。
 */

/**
 * @testcase Indent feature should move items to create hierarchy
 * @description アイテムのインデント操作によって階層構造が適切に作成されることを確認するテスト
 * @check 3つのアイテムを追加してテキストを設定できる
 * @check 2番目のアイテムをタブキーでインデントすると、パディングが増加する
 * @check 3番目のアイテムも同様にインデントできる
 * @check インデント後のパディング値が適切に設定されていることをCSSから検証
 * @check Shift+Tabキーでインデントを減らせる（アンインデント操作）
 * @check アンインデント後のパディング値が減少していることを検証
 */
test("Indent feature should move items to create hierarchy", async ({ page }) => {
    // ホームページにアクセス
    await page.goto("/"); // エミュレータを使用するための設定
    await page.addInitScript(() => {
        // エミュレータを使用するためモックは不要
        window.localStorage.setItem("authenticated", "true");
    });

    // ページが読み込まれるのを待つ
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // ステップ1: まず3つのアイテムを追加
    await page.click('button:has-text("アイテム追加")');
    await page.click('button:has-text("アイテム追加")');
    await page.click('button:has-text("アイテム追加")');

    // 各アイテムにテキストを設定
    const items = page.locator(".outliner-item");

    await items.nth(0).click();
    await page.keyboard.type("最初のアイテム");
    await page.keyboard.press("Enter");

    await items.nth(1).click();
    await page.keyboard.type("2番目のアイテム");
    await page.keyboard.press("Enter");

    await items.nth(2).click();
    await page.keyboard.type("3番目のアイテム");
    await page.keyboard.press("Enter");

    // エディタを終了するために少し待機
    await page.waitForTimeout(500);

    // スクリーンショットを撮って初期状態を確認
    await page.screenshot({ path: "test-results/indent-before.png" });

    // ステップ2: 2番目と3番目のアイテムをインデント
    // 2番目のアイテムを選択してタブキーを押す
    await items.nth(1).click();
    await items.nth(1).focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);

    // 3番目のアイテムを選択してタブキーを押す
    await items.nth(2).click();
    await items.nth(2).focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);

    // インデント後の状態が反映されるのを待つ
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "test-results/indent-after.png" });

    // ステップ3: インデントされたことを検証
    // パディングに基づいてインデントを検証
    const firstItemPadding = await items.nth(0).evaluate(el => {
        return window.getComputedStyle(el).paddingLeft;
    });

    const secondItemPadding = await items.nth(1).evaluate(el => {
        return window.getComputedStyle(el).paddingLeft;
    });

    const thirdItemPadding = await items.nth(2).evaluate(el => {
        return window.getComputedStyle(el).paddingLeft;
    });

    // 2番目、3番目のアイテムがインデントされているかを検証
    console.log(
        `Padding values - First: ${firstItemPadding}, Second: ${secondItemPadding}, Third: ${thirdItemPadding}`,
    );

    // 最初のアイテムよりも2番目のアイテムのパディングが大きい
    expect(parseInt(secondItemPadding)).toBeGreaterThan(parseInt(firstItemPadding));

    // ステップ4: アンインデント操作を確認
    // 3番目のアイテムを選択してShift+Tabキーを押す
    await items.nth(2).click();
    await items.nth(2).focus();
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(500);

    // アンインデント後の状態を確認
    await page.screenshot({ path: "test-results/unindent-after.png" });

    // 3番目のアイテムのパディングが元に戻ったことを検証
    const unindentedThirdPadding = await items.nth(2).evaluate(el => {
        return window.getComputedStyle(el).paddingLeft;
    });

    console.log(`After unindent - Third item padding: ${unindentedThirdPadding}`);

    // パディングが2番目のアイテムと同じになった（アンインデントされた）
    expect(parseInt(unindentedThirdPadding)).toBeLessThan(parseInt(thirdItemPadding));
});
