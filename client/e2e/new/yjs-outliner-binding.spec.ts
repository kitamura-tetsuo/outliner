/** @feature COL-yjs-subscriber-outliner-2way-38e2a021
 *  Title   : OutlinerBase での Yjs 双方向同期（サーバ依存なし）
 */
import { expect, test } from "@playwright/test";

// /yjs-outliner で OutlinerBase を介した双方向同期を確認

async function typeInOutliner(page, text: string) {
    // 最初にアイテムがなければ「アイテム追加」を押す
    const addBtn = page.getByRole("button", { name: "アイテム追加" });
    if (await addBtn.isVisible()) {
        await addBtn.click();
    }

    // 一つ目のアイテムの表示 span をクリックし、編集に入る
    const firstItemSelector = ".outliner-item .item-text";
    await page.waitForSelector(firstItemSelector, { state: "attached" });
    await page.click(firstItemSelector);

    // グローバルテキストエリアで入力（Outliner の入力はこれに集約される）
    const gInput = page.locator("textarea.global-textarea");
    await expect(gInput).toBeVisible();
    await gInput.fill(text);
}

test.describe("OutlinerBase <-> Yjs", () => {
    test("入力 -> Y.Text/表示 反映", async ({ page }) => {
        await page.goto("/yjs-outliner");

        // 編集＆反映
        await typeInOutliner(page, "hello outliner");

        // 表示に反映
        const firstText = page.locator(".outliner-item .item-text").first();
        await expect(firstText).toContainText("hello outliner");
    });
});
