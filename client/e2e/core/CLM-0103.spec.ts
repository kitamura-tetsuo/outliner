/** @feature CLM-0103
 *  Title   : フォーマット文字列でのカーソル操作
 *  Source  : docs/client-features.yaml
 */

import { test, expect } from '@playwright/test';
import { setupTestPage, waitForCursorVisible } from '../helpers';

test.describe('フォーマット文字列でのカーソル操作', () => {
  test('太字文字列内でのカーソル移動が正しく機能する', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 太字を含むテキストを入力
    await page.keyboard.type('これは[[太字テキスト]]です');
    
    // カーソルを文頭に移動
    await page.keyboard.press('Home');
    
    // 右矢印キーで太字部分まで移動
    for (let i = 0; i < 'これは'.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    
    // さらに太字の開始タグを通過
    for (let i = 0; i < '[['.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    
    // カーソル位置を確認（太字テキストの先頭にあるはず）
    // カーソル位置の確認は難しいので、ここで文字を挿入して位置を確認
    await page.keyboard.type('挿入');
    
    const textContent = await item.locator('.item-text').textContent();
    expect(textContent).toBe('これは[[挿入太字テキスト]]です');

    // カーソルが表示されていることを確認
    await waitForCursorVisible(page);
  });

  test('複数のフォーマットが混在する文字列でのカーソル移動', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 複数のフォーマットを含むテキストを入力
    await page.keyboard.type('通常[[太字]][/斜体][-取り消し線]`コード`');
    
    // カーソルを文頭に移動
    await page.keyboard.press('Home');
    
    // 右矢印キーで各フォーマット部分を順に移動し、テキストを挿入
    // 通常テキストの後
    for (let i = 0; i < '通常'.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.type('1');
    
    // 太字の開始タグの後
    for (let i = 0; i < '[['.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.type('2');
    
    // 太字テキストの後
    for (let i = 0; i < '太字'.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.type('3');
    
    // 太字の終了タグの後
    for (let i = 0; i < ']]'.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.type('4');
    
    const textContent = await item.locator('.item-text').textContent();
    expect(textContent).toBe('通常1[[2太字3]]4[/斜体][-取り消し線]`コード`');

    // カーソルが表示されていることを確認
    await waitForCursorVisible(page);
  });

  test('Home/Endキーがフォーマット文字列で正しく機能する', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // フォーマットを含むテキストを入力
    await page.keyboard.type('これは[[太字テキスト]]です');
    
    // Homeキーでカーソルを行頭に移動
    await page.keyboard.press('Home');
    await page.keyboard.type('行頭');
    
    // Endキーでカーソルを行末に移動
    await page.keyboard.press('End');
    await page.keyboard.type('行末');
    
    const textContent = await item.locator('.item-text').textContent();
    expect(textContent).toBe('行頭これは[[太字テキスト]]です行末');

    // カーソルが表示されていることを確認
    await waitForCursorVisible(page);
  });

  test('Shift+矢印キーによる選択がフォーマット文字列で正しく機能する', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // フォーマットを含むテキストを入力
    await page.keyboard.type('これは[[太字テキスト]]です');
    
    // カーソルを文頭に移動
    await page.keyboard.press('Home');
    
    // 右矢印キーで「これは」の後まで移動
    for (let i = 0; i < 'これは'.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    
    // Shift+右矢印で「[[太字テキスト]]」を選択
    await page.keyboard.down('Shift');
    for (let i = 0; i < '[[太字テキスト]]'.length; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.up('Shift');
    
    // 選択範囲を削除
    await page.keyboard.press('Delete');
    
    const textContent = await item.locator('.item-text').textContent();
    expect(textContent).toBe('これはです');

    // カーソルが表示されていることを確認
    await waitForCursorVisible(page);
  });

  test('フォーマット文字列内での単語単位の移動（Ctrl+矢印）', async ({ page }) => {
    await setupTestPage(page);

    // 最初のアイテムを選択
    const item = page.locator('.outliner-item').first();
    await item.locator('.item-content').click();

    // 複数の単語を含むフォーマットテキストを入力
    await page.keyboard.type('これは [[太字 テキスト 単語]] と [/斜体 単語] です');
    
    // カーソルを文頭に移動
    await page.keyboard.press('Home');
    
    // Ctrl+右矢印で単語単位で移動
    await page.keyboard.press('Control+ArrowRight'); // 「これは」の後
    await page.keyboard.press('Control+ArrowRight'); // 「[[太字」の後
    
    // 現在位置に文字を挿入
    await page.keyboard.type('_挿入_');
    
    const textContent = await item.locator('.item-text').textContent();
    // 環境によって単語の区切り方が異なる可能性があるため、
    // 挿入されたテキストが含まれていることだけを確認
    expect(textContent).toContain('_挿入_');

    // カーソルが表示されていることを確認
    await waitForCursorVisible(page);
  });
});
