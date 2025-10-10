import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/**
 * 基本確認（single navigation と Yjs書き込みガード）
 * - アウトラインページの表示完了までにメインフレームの遷移が1回のみであること
 * - 表示完了までに prepareTestEnvironment 以外による Yjs への書き込み（代表: project.addPage）が無いこと
 */

test.describe("Basic: single navigation & Yjs guard", () => {
    test("navigates once and no Yjs writes before display", async ({ page }, testInfo) => {
        // メインフレームの遷移回数をカウント
        const mainUrls = new Set<string>();
        const mainPaths = new Set<string>();
        const normalizePath = (u: string) => {
            try {
                const url = new URL(u);
                let p = url.pathname;
                if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
                return p;
            } catch {
                return u;
            }
        };
        page.on("framenavigated", (frame) => {
            if (frame !== page.mainFrame()) return;
            try {
                const href = frame.url();
                if (href && href.startsWith("http")) {
                    mainUrls.add(href);
                    mainPaths.add(normalizePath(href));
                }
            } catch {}
        });

        // 早期に Yjs 書き込み検知プローブを準備（generalStore が用意された後に wrap）
        await page.addInitScript(() => {
            (window as any).__E2E_WRITES = [] as Array<{ method: string; ts: number; }>; // 書き込みログ
            (window as any).__E2E_INSTALL_WRITES__ = function install() {
                try {
                    const gs: any = (window as any).generalStore;
                    if (!gs?.project) return false;
                    const proj: any = gs.project;
                    if (!proj || (proj as any).__e2eWrapped) return !!proj;
                    const wrap = (obj: any, name: string) => {
                        try {
                            const orig = obj?.[name];
                            if (typeof orig !== "function") return;
                            obj[name] = function(...args: any[]) {
                                try {
                                    (window as any).__E2E_WRITES.push({ method: name, ts: Date.now() });
                                } catch {}
                                return orig.apply(this, args);
                            };
                        } catch {}
                    };
                    // 代表的な書き込み API を wrap（ここでは project.addPage のみを厳密監視）
                    wrap(proj, "addPage");
                    (proj as any).__e2eWrapped = true;
                    return true;
                } catch {
                    return false;
                }
            };
        });

        // 単一遷移ターゲット（初期ホーム遷移をスキップして、1回だけターゲットへ遷移）
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined);

        // generalStore が利用可能になったら書き込みプローブをインストール
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore;
            return !!(gs && gs.project);
        });
        await page.evaluate(() => {
            try {
                (window as any).__E2E_INSTALL_WRITES__?.();
            } catch {}
        });

        // アウトラインページ表示（OutlinerBase の data-testid を待つ）
        const outliner = page.locator('[data-testid="outliner-base"]').first();
        await outliner.waitFor({ state: "visible", timeout: 10000 });

        // Debug: 実際に記録された URL/Path を出力
        console.log("E2E Navigated URLs:", Array.from(mainUrls));
        console.log("E2E Navigated Paths:", Array.from(mainPaths));

        // 検証1: メインフレームでのURL(path)遷移が 1 回のみ（about:blank/末尾スラッシュ差分は無視）
        expect(mainPaths.size).toBe(1);

        // 検証2: 表示完了までに prepareTestEnvironment 以外の Yjs 書き込みが無い
        const writes = await page.evaluate(() => (window as any).__E2E_WRITES as Array<any>);
        expect(Array.isArray(writes)).toBe(true);
        expect(writes.length).toBe(0);
    });
});
