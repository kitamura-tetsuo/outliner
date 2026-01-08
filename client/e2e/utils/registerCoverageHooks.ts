import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * E2Eテストのカバレッジ収集フックを、呼び出し元（各specファイル）のスコープに登録する。
 *
 * 注意:
 * - Node.js のモジュールキャッシュにより、単なる副作用インポートでは最初のファイルでしか
 *   フックが登録されないことがあるため、本関数を各specから明示的に呼び出す。
 * - これにより、複数のテストファイルを同一ワーカーで一括実行しても、各ファイルに afterEach が登録される。
 *
 * 環境変数:
 * - PRECISE_COVERAGE=true を設定すると、Precise Coverage モードで実行されます
 * - デフォルトは Best-effort Coverage モードです
 */
export function registerCoverageHooks(): void {
    if (process.env.E2E_DISABLE_COVERAGE === "1") {
        console.log("[Coverage] Disabled by E2E_DISABLE_COVERAGE environment variable");
        return;
    }
    const usePreciseCoverage = process.env.PRECISE_COVERAGE === "true";

    if (usePreciseCoverage) {
        console.log("[Coverage] Using Precise Coverage mode (PRECISE_COVERAGE=true)");
        registerPreciseCoverageHooks();
    } else {
        console.log("[Coverage] Using Best-effort Coverage mode (default)");
        registerBestEffortCoverageHooks();
    }
}

/**
 * Best-effort Coverage モード (デフォルト)
 * - パフォーマンスへの影響が少ない
 * - イベントハンドラやコールバックの実行回数が正しく記録されない場合がある
 */
function registerBestEffortCoverageHooks(): void {
    // 各テストの開始前にカバレッジ収集を開始
    test.beforeEach(async ({ page }, testInfo) => {
        try {
            console.log(`[Coverage] beforeEach start for: ${testInfo.title}`);
            await page.coverage.startJSCoverage({
                resetOnNavigation: false,
                reportAnonymousScripts: true,
            });
        } catch (error: any) {
            if (!error?.message || !String(error.message).includes("Coverage is already started")) {
                console.warn("[Coverage] カバレッジ収集の開始に失敗しました:", error);
            } else {
                console.log("[Coverage] already started");
            }
        }
    });

    // 各テストの終了後にカバレッジを保存
    test.afterEach(async ({ page }, testInfo) => {
        try {
            console.log(`[Coverage] afterEach for: ${testInfo.title}, closed=${page.isClosed()}`);
            if (page.isClosed()) return;

            const coverage = await page.coverage.stopJSCoverage();
            console.log(`[Coverage] collected entries: ${Array.isArray(coverage) ? coverage.length : "n/a"}`);

            // カバレッジデータを保存
            const coverageDir = path.join(process.cwd(), "..", "coverage", "e2e", "raw");
            fs.mkdirSync(coverageDir, { recursive: true });

            // テスト名からファイル名を生成（特殊文字を除去）
            const testFile = path.basename(testInfo.file, ".spec.ts");
            const testTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, "_");
            const timestamp = Date.now();
            const coverageFile = path.join(
                coverageDir,
                `coverage-${testFile}-${testTitle}-${timestamp}.json`,
            );

            fs.writeFileSync(coverageFile, JSON.stringify(coverage, null, 2));
            console.log(`[Coverage] wrote: ${coverageFile}`);
        } catch (error) {
            console.error(`[Coverage] カバレッジ収集の停止に失敗しました (${testInfo.title}):`, error);
        }
    });
}

/**
 * Precise Coverage モード
 * - イベントハンドラやコールバックの実行回数を正確に取得
 * - パフォーマンスへの影響が大きい
 * - 最適化が無効化されるため、実行速度が遅くなる
 *
 * 使用方法:
 * PRECISE_COVERAGE=true npm run test:e2e
 */
function registerPreciseCoverageHooks(): void {
    let cdpSession: any = null;

    // 各テストの開始前にPrecise Coverageを開始
    test.beforeEach(async ({ page }, testInfo) => {
        try {
            console.log(`[PreciseCoverage] beforeEach start for: ${testInfo.title}`);

            // CDPセッションを作成
            cdpSession = await page.context().newCDPSession(page);

            // Profilerを有効化
            await cdpSession.send("Profiler.enable");

            // Precise Coverageを開始
            // callCount: true - 実行回数を取得
            // detailed: true - ブロックレベルのカバレッジを取得
            await cdpSession.send("Profiler.startPreciseCoverage", {
                callCount: true,
                detailed: true,
            });

            console.log(`[PreciseCoverage] Started with callCount and detailed mode`);
        } catch (error: any) {
            console.error("[PreciseCoverage] カバレッジ収集の開始に失敗しました:", error);
        }
    });

    // 各テストの終了後にカバレッジを保存
    test.afterEach(async ({ page }, testInfo) => {
        try {
            console.log(`[PreciseCoverage] afterEach for: ${testInfo.title}, closed=${page.isClosed()}`);
            if (page.isClosed() || !cdpSession) return;

            // Precise Coverageを取得
            const { result } = await cdpSession.send("Profiler.takePreciseCoverage");
            console.log(`[PreciseCoverage] collected entries: ${Array.isArray(result) ? result.length : "n/a"}`);

            // Precise Coverageを停止
            await cdpSession.send("Profiler.stopPreciseCoverage");
            await cdpSession.send("Profiler.disable");

            // CDPセッションをデタッチ
            await cdpSession.detach();
            cdpSession = null;

            // カバレッジデータを保存
            const coverageDir = path.join(process.cwd(), "..", "coverage", "e2e", "raw-precise");
            fs.mkdirSync(coverageDir, { recursive: true });

            // テスト名からファイル名を生成（特殊文字を除去）
            const testFile = path.basename(testInfo.file, ".spec.ts");
            const testTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, "_");
            const timestamp = Date.now();
            const coverageFile = path.join(
                coverageDir,
                `coverage-precise-${testFile}-${testTitle}-${timestamp}.json`,
            );

            fs.writeFileSync(coverageFile, JSON.stringify(result, null, 2));
            console.log(`[PreciseCoverage] wrote: ${coverageFile}`);
        } catch (error) {
            console.error(`[PreciseCoverage] カバレッジ収集の停止に失敗しました (${testInfo.title}):`, error);
        }
    });
}
