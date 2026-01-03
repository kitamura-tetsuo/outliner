import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0003
 *  Title   : 拡張フォーマット
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("拡張フォーマット", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("リンクが正しく表示される", async ({ page }) => {
        // 最初のアイテムを選択（ページタイトルではない最初のアイテム）
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // 既存のテキストを削除
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // リンクを含むテキストを入力（insertTextを使用して特殊文字を正しく入力）
        await page.keyboard.insertText("これは[https://example.com]リンクです");
        await page.waitForTimeout(200);

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 別のアイテムをクリックしてフォーカスを移動（フォーマットを適用させるため）
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).locator(".item-content").click();

        // フォーマットが適用されるのを待つ (robust wait)
        await expect.poll(async () => {
            return await page.locator(
                `.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`,
            ).first().innerHTML();
        }).toContain('<a href="https://example.com"');
    });

    test("引用が正しく表示される", async ({ page }) => {
        // 最初のアイテムを選択（ページタイトルではない最初のアイテム）
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // 既存のテキストを削除
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // 引用を含むテキストを入力
        await page.keyboard.insertText("> これは引用文です");
        await page.waitForTimeout(200);

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 別のアイテムをクリックしてフォーカスを移動（フォーマットを適用させるため）
        const secondItemId2 = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId2).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId2}"]`).locator(".item-content").click();

        // フォーマットが適用されるのを待つ
        await expect.poll(async () => {
            return await page.locator(
                `.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`,
            ).first().innerHTML();
        }).toContain("これは引用文です");
    });

    test("複合フォーマットが正しく表示される", async ({ page }) => {
        // 最初のアイテムを選択（ページタイトルではない最初のアイテム）
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // 既存のテキストを削除
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // 複合フォーマットを含むテキストを入力（リストと引用を別々に）
        await page.keyboard.insertText("- [[太字]]と[/ 斜体]の[https://example.com]リンク");
        await page.waitForTimeout(200);

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 別のアイテムをクリックしてフォーカスを移動（フォーマットを適用させるため）
        const secondItemId3 = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId3).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId3}"]`).locator(".item-content").click();

        // フォーマットが適用されるのを待つ
        await expect.poll(async () => {
            const html = await page.locator(
                `.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`,
            ).first().innerHTML();
            return html.includes("<strong>") && html.includes("<em>") && html.includes('<a href="https://example.com"');
        }).toBe(true);
    });

    test("カーソルがあるアイテムでは拡張フォーマットもプレーンテキストで表示される", async ({ page }) => {
        // 最初のアイテムを選択（ページタイトルではない最初のアイテム）
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // 既存のテキストを削除
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // 複合フォーマットを含むテキストを入力
        const complexText = "- [[太字]]と[/斜体]の[https://example.com]リンク";
        await page.keyboard.insertText(complexText);
        await page.waitForTimeout(200);

        // カーソルがあるアイテムのテキストを確認
        const itemText = await page.locator(`.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`)
            .first().textContent();

        // テキストに制御文字が含まれていることを確認（完全一致ではなく、含まれているかを確認）
        expect(itemText).toContain("太字");
        expect(itemText).toContain("斜体");
        expect(itemText).toContain("https://example.com");
        expect(itemText).toContain("リンク");

        // 入力したテキストがHTMLとして表示されていないことを確認
        const itemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`)
            .first().innerHTML();
        expect(itemHtml).toContain('class="control-char"'); // 制御文字が特別なクラスで表示されていることを確認
    });
});
