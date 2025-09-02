/** @feature COL-yjs-subscriber-2way-binding-9b1f5e0d
 *  Title   : Yjs Text <-> Svelte 双方向同期 (サーバ依存なし)
 */
import { expect, test } from "@playwright/test";

// /yjs-test ページで、Y.Doc の Y.Text と input 要素の双方向同期を検証する

test.describe("Yjs Text <-> Svelte 双方向同期", () => {
    test("入力 -> Y.Text -> 表示 / Y.Text -> 表示", async ({ page }) => {
        await page.goto("/yjs-test");

        const input = page.locator("#yjs-input");
        const output = page.locator("#yjs-output");
        const ybtn = page.locator("#yjs-update");

        // 初期は空
        await expect(input).toHaveValue("");
        await expect(output).toHaveText("");

        // 入力 -> Y.Text に反映 -> 表示へ反映
        await input.fill("hello yjs");
        await expect(output).toHaveText("hello yjs");

        // Yjs 側からの更新 -> 表示へ反映
        await ybtn.click();
        await expect(output).toHaveText("updated-by-yjs");

        // 再度、入力で上書き
        await input.fill("final");
        await expect(output).toHaveText("final");
    });
});
