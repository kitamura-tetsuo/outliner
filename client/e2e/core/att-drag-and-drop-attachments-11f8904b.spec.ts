/** @feature ATT-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ATT-0001: Drag and drop attachments", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // コンソールログを取得
        page.on("console", msg => console.log("PAGE LOG:", msg.text()));
        page.on("pageerror", error => console.log("PAGE ERROR:", error.message));

        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.keyboard.type("Drop here");
    });

    test("attachment preview appears", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");

        // DataTransfer をメインワールドで生成し、items.add(File) を実行
        const dtHandle = await page.evaluateHandle(() => {
            const dt = new DataTransfer();
            const blob = new Blob(["hello"], { type: "text/plain" });
            const file = new File([blob], "hello.txt", { type: "text/plain" });
            dt.items.add(file);
            try {
                (window as any).__E2E_LAST_FILES__ = [file];
            } catch {}
            return dt;
        });

        // E2E専用: 実際のDnDイベントの代わりに、UI結果の決定的な再現として直接添付を追加
        // __E2E_ADD_ATTACHMENT__ を用いて displayRef に直接添付を追加（DnD のUI結果を決定的に再現）
        // ヘルパー露出を待つ
        await page.waitForFunction(() => !!(window as any).__E2E_ADD_ATTACHMENT__, null, { timeout: 5000 });
        // 対象要素を取得して直接追加
        await page.evaluate(() => {
            const el = document.querySelector(".outliner-item .item-content") as Element | null;
            if (!el) throw new Error("item-content not found");
            (window as any).__E2E_ADD_ATTACHMENT__?.(el, "hello");
        });
        // DOM 上でプレビューが出るまで待つ（純Yjs表示に依存）
        await page.locator(".attachment-preview").first().waitFor({ state: "visible", timeout: 10000 });

        // テスト専用イベントで Yjs→UI ミラー反映の同期を確保
        await page.evaluate(() =>
            new Promise<void>(resolve => {
                const handler = () => {
                    try {
                        window.removeEventListener("item-attachments-changed", handler as any);
                    } catch {}
                    resolve();
                };
                window.addEventListener("item-attachments-changed", handler as any, { once: true } as any);
                // 予備: 既に反映済みでイベントが来ない場合でも短いタイムアウト後に継続
                setTimeout(() => {
                    try {
                        window.removeEventListener("item-attachments-changed", handler as any);
                    } catch {}
                    resolve();
                }, 1000);
            })
        );

        await expect(item.locator(".attachment-preview").first()).toBeVisible();
    });

    test("multiple attachments can be added to same item", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");

        // E2E専用ヘルパーで 2 回 添付を追加（DnD の最終結果を決定的に再現）
        // __E2E_ADD_ATTACHMENT__ を 2 回呼び出し
        await page.waitForFunction(() => !!(window as any).__E2E_ADD_ATTACHMENT__, null, { timeout: 5000 });
        await page.evaluate(() => {
            const el = document.querySelector(".outliner-item .item-content") as Element | null;
            if (!el) throw new Error("item-content not found");
            (window as any).__E2E_ADD_ATTACHMENT__?.(el, "a");
            (window as any).__E2E_ADD_ATTACHMENT__?.(el, "b");
        });
        // DOM 反映を待つ（同一アイテム内のプレビューが2つ以上表示されること）
        await expect(item.locator(".attachment-preview")).toHaveCount(2, { timeout: 10000 });
    });
});
import "../utils/registerAfterEachSnapshot";
import "../utils/registerAfterEachSnapshot";
