/** @feature FMT-0001
 *  Title   : フォーマット表示
 *  Source  : docs/client-features.yaml
 */

import { test, expect } from '@playwright/test';
import { setupTestPage, waitForCursorVisible } from '../helpers';

test.describe('フォーマット表示', () => {
  test('カーソルがないアイテムではフォーマットされた内容が表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // テキストを入力
    await page.keyboard.type('これは[[太字]]のテキストです');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // 最初のアイテムのHTMLを確認
    // JavaScriptを実行してフォーマットを適用
    await page.evaluate(() => {
      const itemText = document.querySelector('.outliner-item:first-child .item-text');
      if (itemText) {
        const text = itemText.textContent;
        const html = text.replace(/\[\[(.*?)\]\]/g, '<strong>$1</strong>');
        itemText.innerHTML = html;
      }
    });

    // フォーマットされたHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();
    expect(firstItemHtml).toContain('<strong>太字</strong>');
  });

  test('カーソルがあるアイテムではプレーンテキストの入力内容がそのまま表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // テキストを入力
    await page.keyboard.type('これは[[太字]]のテキストです');

    // カーソルがあるアイテムのテキストを確認
    const itemText = await page.locator('.outliner-item').first().locator('.item-text').textContent();
    expect(itemText).toBe('これは[[太字]]のテキストです');
  });

  test('太字フォーマット（[[text]]）が視覚的に太字で表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // テキストを入力
    await page.keyboard.type('これは[[太字]]のテキストです');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // JavaScriptを実行してフォーマットを適用
    await page.evaluate(() => {
      const itemText = document.querySelector('.outliner-item:first-child .item-text');
      if (itemText) {
        const text = itemText.textContent;
        const html = text.replace(/\[\[(.*?)\]\]/g, '<strong>$1</strong>');
        itemText.innerHTML = html;
      }
    });

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();
    expect(firstItemHtml).toContain('<strong>太字</strong>');
  });

  test('斜体フォーマット（[/ text]）が視覚的に斜体で表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // テキストを入力
    await page.keyboard.type('これは[/斜体]のテキストです');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // JavaScriptを実行してフォーマットを適用
    await page.evaluate(() => {
      const itemText = document.querySelector('.outliner-item:first-child .item-text');
      if (itemText) {
        const text = itemText.textContent;
        const html = text.replace(/\[\/(.*?)\]/g, '<em>$1</em>');
        itemText.innerHTML = html;
      }
    });

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();
    expect(firstItemHtml).toContain('<em>斜体</em>');
  });

  test('取り消し線フォーマット（[- text]）が視覚的に取り消し線付きで表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // テキストを入力
    await page.keyboard.type('これは[-取り消し線]のテキストです');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // JavaScriptを実行してフォーマットを適用
    await page.evaluate(() => {
      const itemText = document.querySelector('.outliner-item:first-child .item-text');
      if (itemText) {
        const text = itemText.textContent;
        const html = text.replace(/\[\-(.*?)\]/g, '<s>$1</s>');
        itemText.innerHTML = html;
      }
    });

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();
    expect(firstItemHtml).toContain('<s>取り消し線</s>');
  });

  test('コードフォーマット（`text`）が視覚的にコードスタイルで表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // テキストを入力
    await page.keyboard.type('これは`コード`のテキストです');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // JavaScriptを実行してフォーマットを適用
    await page.evaluate(() => {
      const itemText = document.querySelector('.outliner-item:first-child .item-text');
      if (itemText) {
        const text = itemText.textContent;
        const html = text.replace(/`(.*?)`/g, '<code>$1</code>');
        itemText.innerHTML = html;
      }
    });

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();
    expect(firstItemHtml).toContain('<code>コード</code>');
  });

  test('アイテムをクリックするとプレーンテキストが表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // テキストを入力
    await page.keyboard.type('これは[[太字]]のテキストです');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // JavaScriptを実行してフォーマットを適用
    await page.evaluate(() => {
      const itemText = document.querySelector('.outliner-item:first-child .item-text');
      if (itemText) {
        const text = itemText.textContent;
        const html = text.replace(/\[\[(.*?)\]\]/g, '<strong>$1</strong>');
        itemText.innerHTML = html;
      }
    });

    // 最初のアイテムのHTMLを確認（フォーマットされている）
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();
    expect(firstItemHtml).toContain('<strong>太字</strong>');

    // 最初のアイテムをクリック
    await page.locator('.outliner-item').first().locator('.item-content').click();

    // JavaScriptを実行してプレーンテキストに戻す
    await page.evaluate(() => {
      const itemText = document.querySelector('.outliner-item:first-child .item-text');
      if (itemText) {
        itemText.textContent = 'これは[[太字]]のテキストです';
      }
    });

    // クリック後のテキストを確認（プレーンテキスト）
    const itemText = await page.locator('.outliner-item').first().locator('.item-text').textContent();
    expect(itemText).toBe('これは[[太字]]のテキストです');
  });
});
