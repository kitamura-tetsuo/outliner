import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ALS-8a1f2c30
 *  Title   : Alias path fallback via lastConfirmedTargetId within 2s
 *  Source  : docs/client-features/als-alias-fallback-lastconfirmed-8a1f2c30.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * ケース: aliasPickerStore.lastConfirmedTargetId によるフォールバックが 2 秒以内に有効で、UI にパスが表示される
 */

test.describe("ALS-8a1f2c30: alias fallback shows path within 2s", () => {
    test("lastConfirmedTargetId fallback renders alias path text", async ({ page }, testInfo) => {
        // 特定の行でページを初期化（ターゲット用とエイリアス用）
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "PAGE TITLE",
            "TARGET AAA",
            "ALIAS PLACEHOLDER",
        ]);

        // プロジェクトページへ（prepare で遷移済みだが明示）
        // await page.goto(`/${projectName}/${pageName}`);

        // 文言から安定的にターゲット/エイリアスのIDを取得
        const [targetId, aliasId] = await page.evaluate(() => {
            const findIdByExactText = (text: string): string | null => {
                const nodes = Array.from(
                    document.querySelectorAll<HTMLElement>(".outliner-item[data-item-id] .item-text"),
                );
                for (const n of nodes) {
                    const t = (n.innerText || n.textContent || "").trim();
                    if (t === text) {
                        const item = n.closest<HTMLElement>(".outliner-item[data-item-id]");
                        return item?.dataset.itemId ?? null;
                    }
                }
                return null;
            };
            const tId = findIdByExactText("TARGET AAA");
            const aId = findIdByExactText("ALIAS PLACEHOLDER");
            return [tId, aId];
        });
        expect(targetId).toBeTruthy();
        expect(aliasId).toBeTruthy();

        // aliasPickerStore の直近確定情報をセット（2秒以内）
        await page.evaluate(([itemId, targetId]) => {
            const ap: any = (window as any).aliasPickerStore;
            if (!ap) throw new Error("aliasPickerStore not found");
            ap.lastConfirmedItemId = itemId;
            ap.lastConfirmedTargetId = targetId;
            ap.lastConfirmedAt = Date.now();
            // 依存の再計算を確実にするため、対象アイテムの text を微変更して再描画を促す
            const gs: any = (window as any).generalStore;
            const items = gs?.currentPage?.items as any;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = items.at ? items.at(i) : items[i];
                if (String(it.id) === String(itemId)) {
                    const t = (it.text?.toString?.() ?? "") + " ";
                    it.updateText(t);
                    break;
                }
            }
        }, [aliasId!, targetId!]);

        // data-alias-target-id が反映されるのをまず待機（派生の発火を確実に）
        await page.waitForSelector(`[data-item-id="${aliasId}"][data-alias-target-id="${targetId}"]`, {
            timeout: 6000,
            state: "attached",
        });

        // エイリアスパスがレンダリングされるまで待機（2秒以内のフォールバックが効く）
        const aliasPath = page.locator(`[data-item-id="${aliasId}"] .alias-path[data-alias-owner-id="${aliasId}"]`);
        await expect(aliasPath).toBeVisible({ timeout: 6000 });

        // パスのテキストにターゲットの文字列が含まれる
        await expect(aliasPath).toContainText("TARGET AAA");
    });
});
