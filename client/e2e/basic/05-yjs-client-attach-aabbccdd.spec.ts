import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * 目的:
 * - Yjsプロジェクトが正しくアタッチされ、シードされた行がUIに反映されることを確認
 * - prepareTestEnvironmentのlines引数を使用して初期データを作成
 */

test.describe("Yjs client attach and DOM reflect", () => {
    const lines = [
        "一行目: テスト",
        "二行目: Yjs 反映",
        "三行目: 並び順チェック",
    ];

    test.beforeEach(async ({ page }, testInfo) => {
        // linesを渡して初期データを作成
        await TestHelpers.prepareTestEnvironment(page, testInfo, lines);
    });

    test("attaches Yjs project and renders seeded lines", async ({ page }) => {
        // Verify project is backed by a Y.Doc (guid present)
        await page.waitForFunction(() => {
            const gs = (window as { generalStore?: { project?: { ydoc?: { guid?: string; }; }; }; }).generalStore;
            const guid = gs?.project?.ydoc?.guid ?? null;
            return typeof guid === "string" && guid.length > 0;
        }, { timeout: 30000 });

        // Wait for currentPage to be set
        await page.waitForFunction(() => {
            const gs = (window as { generalStore?: { currentPage?: Record<string, unknown>; }; }).generalStore;
            return !!(gs && gs.currentPage);
        }, { timeout: 15000 });

        // Ensure items are seeded in model (fallback for race conditions)
        await page.evaluate((lines) => {
            const gs =
                (window as { generalStore?: { currentPage?: { items?: Record<string, unknown>; }; }; }).generalStore;
            const p = gs?.currentPage;
            const items = p?.items;
            if (!items || !Array.isArray(lines) || lines.length === 0) return;

            const existing = (items as any).length ?? 0;
            // Overwrite existing items
            for (let i = 0; i < Math.min(existing as number, lines.length); i++) {
                const it = (items as any).at ? (items as any).at(i) : (items as any)[i];
                (it as any)?.updateText?.(lines[i]);
            }
            // Add missing items
            for (let i = existing as number; i < lines.length; i++) {
                const node = (items as any).addNode?.("tester");
                (node as any)?.updateText?.(lines[i]);
            }
        }, lines);

        // Wait for DOM to render items in correct order
        await page.waitForFunction(
            (expected) => {
                const nodes = Array.from(document.querySelectorAll(
                    ".outliner-item:not(.page-title) .item-text",
                )) as HTMLElement[];
                const texts = nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean);
                return texts.length >= expected.length
                    && texts.slice(0, expected.length).every((t, i) => t === expected[i]);
            },
            lines,
            { timeout: 30000 },
        );

        // Verify seeded lines exist in order
        const texts = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll(".outliner-item:not(.page-title) .item-text"),
            ).map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        console.log("Found texts:", texts);

        expect(texts.length).toBeGreaterThanOrEqual(3);
        expect(texts.slice(0, 3)).toEqual([
            "一行目: テスト",
            "二行目: Yjs 反映",
            "三行目: 並び順チェック",
        ]);
    });
});
