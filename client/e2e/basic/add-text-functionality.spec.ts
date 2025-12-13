import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @playwright
 * @title テキスト追加機能テスト
 * @description UI経由で新規アイテムと既存アイテムにテキストを追加できることを確認します。
 */

test.describe("テキスト追加機能テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase 新規アイテムにUI経由でテキストを追加できる
     * @description アイテム追加ボタンをクリックして新規アイテムを作成し、
     * キーボード入力でテキストを追加できることを確認します。
     */
    test("新規アイテムにUI経由でテキストを追加できる", async ({ page }) => {
        // 初期のアイテム数を記録
        const initialItems = page.locator(".outliner-item[data-item-id]");
        const initialCount = await initialItems.count();

        // アイテム追加ボタンをクリック（page-toolbar内のボタンを使用）
        const addButton = page.getByTestId("page-toolbar").getByRole("button", { name: "アイテム追加" });
        await addButton.click();
        await page.waitForTimeout(500);

        // 新しいアイテムが追加されたことを確認
        const items = page.locator(".outliner-item[data-item-id]");
        const newCount = await items.count();
        expect(newCount).toBeGreaterThan(initialCount);

        // 新しく追加されたアイテムを取得（initialCount番目のアイテム、0-indexed）
        const newItem = items.nth(initialCount);
        await newItem.locator(".item-content").click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(500);

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        const testText = "新規アイテムのテキスト";
        await page.keyboard.type(testText);
        await page.waitForTimeout(500);

        // 入力したテキストが表示されていることを確認
        // innerTextを使用してHTMLタグを除外したテキストを取得
        const itemText = await newItem.locator(".item-text").innerText();
        expect(itemText).toContain(testText);
    });

    /**
     * @testcase 既存アイテムにUI経由でテキストを追加できる
     * @description 既存のアイテムをクリックして編集モードに入り、
     * キーボード入力でテキストを追加できることを確認します。
     */
    test("既存アイテムにUI経由でテキストを追加できる", async ({ page }) => {
        // 既存のアイテムを取得（ページタイトル以外の最初のアイテム）
        const items = page.locator(".outliner-item[data-item-id]");
        const itemCount = await items.count();
        expect(itemCount).toBeGreaterThan(0);

        // 最初のアイテムを取得
        const firstItem = items.first();
        const itemId = await firstItem.getAttribute("data-item-id");
        expect(itemId).toBeTruthy();

        // 新しいテキストを入力
        const testText = "既存アイテムの新しいテキスト";
        await TestHelpers.setCursor(page, itemId!, 0);
        await TestHelpers.insertText(page, itemId!, testText);
        await page.waitForTimeout(500);

        // 入力したテキストが表示されていることを確認
        // innerTextを使用してHTMLタグを除外したテキストを取得
        const itemText = await firstItem.locator(".item-text").innerText();
        expect(itemText).toContain(testText);
    });
});
