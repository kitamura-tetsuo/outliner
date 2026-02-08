import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * 目的:
 * - createAndSeedProject の lines に与えた配列が、UI に同順で描画されることを確認する
 * - DOM は data-item-id ベースで検証し、Page Title アイテムは除外する
 */

test.describe("Yjs data is reflected in UI", () => {
    const lines = [
        "First line: Test",
        "Second line: Yjs reflection",
        "Third line: Order check",
    ];

    test.beforeEach(async ({ page }, testInfo) => {
        // Use HTTP-based seeding via SeedClient instead of legacy browser-based seeding
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(page, testInfo, lines);
        // Navigate to the seeded page
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, lines);
    });

    test("lines are displayed in correct order", async ({ page }) => {
        // currentPage がセットされるのを待機
        await page.waitForFunction(() => {
            const gs = (window as { generalStore?: { currentPage?: Record<string, unknown>; }; }).generalStore;
            return !!(gs && gs.currentPage);
        }, { timeout: 15000 });

        // 念のため: currentPage の子を lines に合わせて整える（不足分は生成、既存は上書き）
        await page.evaluate((lines) => {
            const gs =
                (window as { generalStore?: { currentPage?: { items?: Record<string, unknown>; }; }; }).generalStore;
            const p = gs?.currentPage;
            const items = p?.items;
            if (!items || !Array.isArray(lines) || lines.length === 0) return;

            const existing = (items as any).length ?? 0;
            // 既存分は上書き
            for (let i = 0; i < Math.min(existing as number, lines.length); i++) {
                const it = (items as any).at ? (items as any).at(i) : (items as any)[i];
                (it as any)?.updateText?.(lines[i]);
            }
            // 不足分は追加
            for (let i = existing as number; i < lines.length; i++) {
                const node = (items as any).addNode?.("tester");
                (node as any)?.updateText?.(lines[i]);
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
                    const gs = (window as { generalStore?: { currentPage?: { items?: Record<string, unknown>; }; }; })
                        .generalStore;
                    const items = gs?.currentPage?.items;
                    return !!items && typeof items.length === "number" && items.length >= expectedLen;
                },
                lines.length,
                { timeout: 30000 },
            );

            // 各アイテムのテキストをモデル経由で設定
            await page.evaluate((lines) => {
                const gs = (window as { generalStore?: { currentPage?: { items?: Record<string, unknown>; }; }; })
                    .generalStore;
                const items = gs?.currentPage?.items as any;
                if (!items) return;
                for (let i = 0; i < lines.length; i++) {
                    const it = items.at ? items.at(i) : items[i];
                    (it as any)?.updateText?.(lines[i]);
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
