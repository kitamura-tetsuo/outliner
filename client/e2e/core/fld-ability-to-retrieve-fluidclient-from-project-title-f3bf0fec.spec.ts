/** @feature YJS-0001
 *  Title   : プロジェクトとページをYjsで取得・検証する
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";

/**
 * YJS-0001: プロジェクトとページの取得・検証（Yjs）
 *
 * このテストでは、Yjs ベースのストアからプロジェクトを取得し、
 * 指定したタイトルのページを作成・検索できることを確認します。
 */
test.describe("YJS-0001: プロジェクトとページの取得・検証", () => {
    const testPageTitle = `test-page-${Date.now()}`;

    test.beforeEach(async ({ page }) => {
        // 軽量なYjsルートへ移動
        try {
            await page.goto("/yjs-outliner");
        } catch {
            await page.goto("/");
        }
        await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();
        // generalStore.project の初期化完了を待機
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore;
            return !!(gs && gs.project);
        }, { timeout: 15000 });
    });

    test("Yjsプロジェクトが存在しページを作成・検索できる", async ({ page }) => {
        // プロジェクトにページを作成
        await page.evaluate((title) => {
            const gs: any = (window as any).generalStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");
            const page = gs.project.addPage(title, "tester");
            // 子アイテムを1つ追加
            page.items.addNode("tester").updateText("child");
        }, testPageTitle);

        // そのページが存在することを検証
        const found = await page.evaluate((title) => {
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                if (String(t).toLowerCase() === String(title).toLowerCase()) return true;
            }
            return false;
        }, testPageTitle);
        expect(found).toBe(true);
    });

    test("空タイトルの検索は未検出（undefined想定）", async ({ page }) => {
        const result = await page.evaluate(() => {
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                if (String(t).trim() === "") return it;
            }
            return undefined;
        });
        // 空タイトルのページが無い前提の判定
        expect(result).toBeUndefined();
    });

    test("存在しないタイトルは見つからない", async ({ page }) => {
        const result = await page.evaluate(() => {
            const title = "__not_exists__";
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                if (String(t).toLowerCase() === title) return it;
            }
            return undefined;
        });
        expect(result).toBeUndefined();
    });

    test("generalStore からプロジェクトデータへアクセスできる", async ({ page }) => {
        const info = await page.evaluate(() => {
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            const titles: string[] = [];
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                titles.push(t);
            }
            return { hasProject: !!gs?.project, pageCount: len, titles };
        });
        expect(info.hasProject).toBe(true);
        expect(info.pageCount).toBeGreaterThan(0);
    });
});
