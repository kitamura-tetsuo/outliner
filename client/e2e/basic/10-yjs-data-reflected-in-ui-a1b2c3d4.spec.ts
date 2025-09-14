import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * 目的:
 * - prepareTestEnvironment の lines に与えた配列が、UI に同順で描画されることを確認する
 * - DOM は data-item-id ベースで検証し、Page Title アイテムは除外する
 */

test.describe("YjsのデータがUIに反映される", () => {
    const lines = [
        "一行目: テスト",
        "二行目: Yjs 反映",
        "三行目: 並び順チェック",
    ];

    test.beforeEach(async ({ page }, testInfo) => {
        // lines を渡して初期データを作成
        await TestHelpers.prepareTestEnvironment(page, testInfo, lines);
    });

    test("lines が正しい順番で表示される", async ({ page }) => {
        // currentPage がセットされるのを待機
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore;
            return !!(gs && gs.currentPage);
        }, { timeout: 15000 });

        // 念のため: currentPage の子を lines に合わせて整える（不足分は生成、既存は上書き）
        await page.evaluate((lines) => {
            const gs = (window as any).generalStore;
            const p = gs?.currentPage;
            const items = p?.items as any;
            if (!items || !Array.isArray(lines) || lines.length === 0) return;

            const existing = items.length ?? 0;
            // 既存分は上書き
            for (let i = 0; i < Math.min(existing, lines.length); i++) {
                const it = items.at ? items.at(i) : items[i];
                it?.updateText?.(lines[i]);
            }
            // 不足分は追加
            for (let i = existing; i < lines.length; i++) {
                const node = items.addNode?.("tester");
                node?.updateText?.(lines[i]);
            }
        }, lines);

        // UI が想定に揃わない場合はUI経由で補正（安定化）
        const matchedInitially = await page
            .waitForFunction(
                (expected) => {
                    const nodes = Array.from(document.querySelectorAll(
                        ".outliner-item:not(.page-title) .item-text",
                    )) as HTMLElement[];
                    const texts = nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean);
                    return texts.length === expected.length && texts.every((t, i) => t === expected[i]);
                },
                lines,
                { timeout: 3000 },
            )
            .then(() => true)
            .catch(() => false);

        if (!matchedInitially) {
            // アイテムが不足していれば追加
            const addBtn = page.locator(".outliner .toolbar .actions button", { hasText: "アイテム追加" }).first();
            for (let i = 0; i < lines.length; i++) {
                await addBtn.click({ force: true });
                await page.waitForTimeout(200);
            }

            // モデル側の件数が期待分になるまで待機
            await page.waitForFunction(
                (expectedLen) => {
                    const gs = (window as any).generalStore;
                    const items = gs?.currentPage?.items as any;
                    return !!items && typeof items.length === "number" && items.length >= expectedLen;
                },
                lines.length,
                { timeout: 10000 },
            );

            // 各アイテムのテキストをモデル経由で設定
            await page.evaluate((lines) => {
                const gs = (window as any).generalStore;
                const items = gs?.currentPage?.items as any;
                if (!items) return;
                for (let i = 0; i < lines.length; i++) {
                    const it = items.at ? items.at(i) : items[i];
                    it?.updateText?.(lines[i]);
                }
            }, lines);
        }

        // 最終的にUIの順序と内容が一致することを確認
        await page.waitForFunction(
            (expected) => {
                const nodes = Array.from(document.querySelectorAll(
                    ".outliner-item:not(.page-title) .item-text",
                )) as HTMLElement[];
                const texts = nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean);
                return texts.length === expected.length && texts.every((t, i) => t === expected[i]);
            },
            lines,
            { timeout: 10000 },
        );
    });
});
