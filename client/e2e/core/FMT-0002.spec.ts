/** @feature FMT-0002
 *  Title   : フォーマット組み合わせ
 *  Source  : docs/client-features.yaml
 */

import { test, expect } from '@playwright/test';
import { setupTestPage, waitForCursorVisible } from '../helpers';

test.describe('フォーマット組み合わせ', () => {
  test('太字と斜体の組み合わせが正しく表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 組み合わせフォーマットのテキストを入力
    await page.keyboard.type('これは[[太字と[/斜体]の組み合わせ]]です');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();

    // 太字と斜体の組み合わせが正しく表示されていることを確認
    // 制御文字のスパンが含まれる可能性があるため、部分的な一致を確認
    expect(firstItemHtml).toContain('<strong>太字と');
    expect(firstItemHtml).toContain('<em>斜体</em>');
    expect(firstItemHtml).toContain('の組み合わせ</strong>');
  });

  test('太字と取り消し線の組み合わせが正しく表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 組み合わせフォーマットのテキストを入力
    await page.keyboard.type('これは[[太字と[-取り消し線]の組み合わせ]]です');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();

    // 太字と取り消し線の組み合わせが正しく表示されていることを確認
    // 制御文字のスパンが含まれる可能性があるため、部分的な一致を確認
    expect(firstItemHtml).toContain('<strong>太字と');
    expect(firstItemHtml).toContain('<s>取り消し線</s>');
    expect(firstItemHtml).toContain('の組み合わせ</strong>');
  });

  test('斜体とコードの組み合わせが正しく表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 組み合わせフォーマットのテキストを入力
    await page.keyboard.type('これは[/斜体と`コード`の組み合わせ]です');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();

    // 斜体とコードの組み合わせが正しく表示されていることを確認
    // 制御文字のスパンが含まれる可能性があるため、部分的な一致を確認
    expect(firstItemHtml).toContain('<em>斜体と');
    expect(firstItemHtml).toContain('<code>コード</code>');
    expect(firstItemHtml).toContain('の組み合わせ</em>');
  });

  test('複数のフォーマットが入れ子になっている場合も正しく表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 複雑な組み合わせフォーマットのテキストを入力
    await page.keyboard.type('これは[[太字と[/斜体と[-取り消し線]と`コード`]]]です');

    // 別のアイテムを作成してカーソルを移動
    await page.keyboard.press('Enter');
    await page.keyboard.type('別のアイテム');

    // 最初のアイテムのHTMLを確認
    const firstItemHtml = await page.locator('.outliner-item').first().locator('.item-text').innerHTML();

    // 複雑な組み合わせが正しく表示されていることを確認
    // 制御文字のスパンが含まれる可能性があるため、部分的な一致を確認
    expect(firstItemHtml).toContain('<strong>太字と');
    expect(firstItemHtml).toContain('<em>斜体と');
    expect(firstItemHtml).toContain('<s>取り消し線</s>');
    expect(firstItemHtml).toContain('<code>コード</code>');
  });

  test('カーソルがあるアイテムでは組み合わせフォーマットもプレーンテキストで表示される', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 組み合わせフォーマットのテキストを入力
    const complexText = 'これは[[太字と[/斜体と[-取り消し線]と`コード`]]]です';
    await page.keyboard.type(complexText);

    // カーソルがあるアイテムのテキストを確認
    const itemText = await page.locator('.outliner-item').first().locator('.item-text').textContent();
    expect(itemText).toBe(complexText);
  });
});
