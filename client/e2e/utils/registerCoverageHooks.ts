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
 */
export function registerCoverageHooks(): void {
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
