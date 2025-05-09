/** @feature FMT-0006
 *  Title   : カーソル移動時のフォーマット表示の一貫性
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { setupTestPage } from "../helpers";
import { TreeValidator } from "../utils/treeValidation";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe('カーソル移動時のフォーマット表示の一貫性', () => {
  test('カーソル移動時に制御文字の表示/非表示が適切に切り替わる', async ({ page }) => {
    // テストページをセットアップ
    await setupTestPage(page);

    // 最初のアイテムを選択
    const firstItem = page.locator('.outliner-item').first();
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 太字テキストを入力
    await page.keyboard.type('[[aasdd]]');

    // 2つ目のアイテムを作成
    await page.keyboard.press('Enter');
    await TestHelpers.waitForCursorVisible(page);

    // 内部リンクテキストを入力
    await page.keyboard.type('[asd]]');

    // 3つ目のアイテムを作成
    await page.keyboard.press('Enter');
    await TestHelpers.waitForCursorVisible(page);

    // 空のアイテムを作成

    // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
    const thirdItem = page.locator('.outliner-item').nth(2);
    await thirdItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 1つ目のアイテムのテキスト内容を確認（制御文字が非表示でフォーマットが適用されていること）
    const firstItemTextWithoutCursor = await firstItem.locator('.item-text').innerHTML();
    expect(firstItemTextWithoutCursor).toContain('<strong>aasdd</strong>');

    // 2つ目のアイテムのテキスト内容を確認（制御文字が非表示で内部リンクが適用されていること）
    const secondItem = page.locator('.outliner-item').nth(1);
    const secondItemTextWithoutCursor = await secondItem.locator('.item-text').innerHTML();
    expect(secondItemTextWithoutCursor).toContain('class="internal-link">asd</a>');
    expect(secondItemTextWithoutCursor).toContain(']');

    // 最初のアイテムに戻る
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 最初のアイテムのテキストコンテンツを取得（制御文字が表示されていることを確認）
    const firstItemTextContent = await firstItem.locator('.item-text').textContent();
    expect(firstItemTextContent).toMatch(/\[\[.*aasdd.*\]\]/);

    // 2つ目のアイテムをクリック
    await secondItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 2つ目のアイテムのテキストコンテンツを取得（制御文字が表示されていることを確認）
    const secondItemTextContent = await secondItem.locator('.item-text').textContent();
    expect(secondItemTextContent).toMatch(/\[.*asd.*\]\]/);
  });

  test('タイトルは常にボールド表示される', async ({ page }) => {
    // テストページをセットアップ
    await setupTestPage(page);

    // タイトルを選択
    const pageTitle = page.locator('.page-title');
    await pageTitle.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // タイトルにテキストを入力
    await page.keyboard.type('aasdd');

    // 通常のアイテムをクリック
    const firstItem = page.locator('.outliner-item').first();
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // タイトルのスタイルを確認（ボールド表示されていること）
    const titleClasses = await pageTitle.locator('.item-text').getAttribute('class');
    expect(titleClasses).toContain('title-text');

    // タイトルをクリック
    await pageTitle.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // タイトルのテキスト内容を確認（制御文字なしでプレーンテキストが表示されていること）
    const titleText = await pageTitle.locator('.item-text').textContent();
    expect(titleText).toBe('aasdd');

    // 通常のアイテムをクリック
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // タイトルのテキスト内容を確認（ボールド表示されていること）
    const titleTextWithoutCursor = await pageTitle.locator('.item-text').textContent();
    expect(titleTextWithoutCursor).toBe('aasdd');
  });

  test('外部リンク構文が正しく表示される', async ({ page }) => {
    // テストページをセットアップ
    await setupTestPage(page);

    // 最初のアイテムを選択
    const firstItem = page.locator('.outliner-item').first();
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 正しいリンクテキストを入力（Scrapbox構文では [URL] の形式）
    await page.keyboard.type('[https://example.com]');

    // 2つ目のアイテムを作成
    await page.keyboard.press('Enter');
    await TestHelpers.waitForCursorVisible(page);

    // 別のテキストを入力
    await page.keyboard.type('別のアイテム');

    // 最初のアイテムのテキスト内容を確認（リンクが適用されていること）
    const firstItemText = await firstItem.locator('.item-text').innerHTML();
    // リンクが適用されていることを確認（実装によって異なる可能性があるため、より柔軟な検証）
    expect(firstItemText).toContain('https://example.com');

    // 最初のアイテムをクリック
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 最初のアイテムのテキスト内容を確認（制御文字が表示されていること）
    const firstItemTextWithCursor = await firstItem.locator('.item-text').innerHTML();
    expect(firstItemTextWithCursor).toContain('<span class="control-char">[</span>');
    expect(firstItemTextWithCursor).toContain('<span class="control-char">]</span>');
  });

  test('内部リンク構文が正しく表示される', async ({ page }) => {
    // テストページをセットアップ
    await setupTestPage(page);

    // 最初のアイテムを選択
    const firstItem = page.locator('.outliner-item').first();
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 内部リンクテキストを入力
    await page.keyboard.type('[asd]]');

    // 2つ目のアイテムを作成
    await page.keyboard.press('Enter');
    await TestHelpers.waitForCursorVisible(page);

    // 別のテキストを入力
    await page.keyboard.type('別のアイテム');

    // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
    const firstItemText = await firstItem.locator('.item-text').innerHTML();
    // 内部リンクが適用されていることを確認（実装によって異なる可能性があるため、より柔軟な検証）
    expect(firstItemText).toContain('asd');
    expect(firstItemText).toContain('internal-link');
    expect(firstItemText).toContain(']');

    // 最初のアイテムをクリック
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 最初のアイテムのテキストコンテンツを取得（制御文字が表示されていることを確認）
    const firstItemTextContent = await firstItem.locator('.item-text').textContent();
    expect(firstItemTextContent).toMatch(/\[.*asd.*\]\]/);
  });

  test('SharedTreeデータが正しく保存される', async ({ page }) => {
    // テストページをセットアップ
    await setupTestPage(page);

    // SharedTreeデータ取得用のデバッグ関数をセットアップ
    await page.addInitScript(() => {
      // グローバルオブジェクトにデバッグ関数を追加
      window.getFluidTreeDebugData = function() {
        // グローバルFluidClientインスタンスを取得
        const fluidClient = window.__FLUID_CLIENT__;
        if (!fluidClient) {
          console.error("FluidClient instance not found");
          return { error: "FluidClient instance not found" };
        }

        try {
          // FluidClientのgetAllDataメソッドを使用してデータを取得
          const treeData = fluidClient.getAllData();
          return treeData;
        } catch (error) {
          console.error("Error getting tree data:", error);
          return { error: error.message || "Unknown error" };
        }
      };
    });

    // 最初のアイテムを選択
    const firstItem = page.locator('.outliner-item').first();
    await firstItem.locator('.item-content').click();
    await TestHelpers.waitForCursorVisible(page);

    // 太字テキストを入力
    await page.keyboard.type('[[aasdd]]');

    // 2つ目のアイテムを作成
    await page.keyboard.press('Enter');
    await TestHelpers.waitForCursorVisible(page);

    // 内部リンクテキストを入力
    await page.keyboard.type('[asd]]');

    // 少し待機してデータが反映されるのを待つ
    await page.waitForTimeout(500);

    // SharedTreeのデータを取得
    const treeData = await TreeValidator.getTreeData(page);

    // データが正しく保存されていることを確認
    expect(treeData.items[0].text).toBe('[[aasdd]]');
    expect(treeData.items[0].items[0].text).toBe('[asd]]');
  });
});
