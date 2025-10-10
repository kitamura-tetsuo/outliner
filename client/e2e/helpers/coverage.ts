/**
 * Playwright E2Eテストのカバレッジ収集ヘルパー
 *
 * monocart-coverage-reportsを使用してV8カバレッジを収集し、
 * Istanbulフォーマットに変換します。
 *
 * 注意: カバレッジは常に収集されます。
 */

import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * カバレッジ収集が有効かどうかを確認
 * @deprecated カバレッジは常に収集されるため、この関数は不要です
 */
export function isCoverageEnabled(): boolean {
    return true;
}

/**
 * ページでカバレッジ収集を開始
 * @deprecated カバレッジは registerCoverageHooks.ts で自動的に収集されます
 */
export async function startCoverage(page: Page): Promise<void> {
    try {
        await page.coverage.startJSCoverage({
            resetOnNavigation: false,
            reportAnonymousScripts: true,
        });
    } catch (error) {
        console.warn("カバレッジ収集の開始に失敗しました:", error);
    }
}

/**
 * ページでカバレッジ収集を停止し、結果を保存
 * @deprecated カバレッジは registerCoverageHooks.ts で自動的に収集されます
 */
export async function stopCoverage(page: Page, testName: string): Promise<void> {
    try {
        const coverage = await page.coverage.stopJSCoverage();

        // カバレッジデータを保存
        const coverageDir = path.join(process.cwd(), "..", "coverage", "e2e", "raw");
        fs.mkdirSync(coverageDir, { recursive: true });

        // テスト名からファイル名を生成（特殊文字を除去）
        const sanitizedTestName = testName.replace(/[^a-zA-Z0-9-_]/g, "_");
        const timestamp = Date.now();
        const coverageFile = path.join(coverageDir, `coverage-${sanitizedTestName}-${timestamp}.json`);

        fs.writeFileSync(coverageFile, JSON.stringify(coverage, null, 2));
    } catch (error) {
        console.warn("カバレッジ収集の停止に失敗しました:", error);
    }
}

/**
 * 注意:
 * E2Eテストのカバレッジは registerCoverageHooks.ts によって自動的に収集されます。
 * このファイルの関数は、手動でカバレッジを制御したい場合にのみ使用してください。
 *
 * 通常は、COVERAGE=true 環境変数を設定してテストを実行するだけで十分です。
 */
