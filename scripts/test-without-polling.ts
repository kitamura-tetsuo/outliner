#!/usr/bin/env tsx
/**
 * ポーリング無効化テストツール
 *
 * 特定のポーリングを一時的に無効化してテストを実行し、
 * テスト結果に影響があるかどうかを確認します。
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface TestResult {
    pollingId: string;
    testPassed: boolean;
    testOutput: string;
    error?: string;
}

interface DisableConfig {
    file: string;
    line: number;
    originalCode: string;
    disabledCode: string;
}

/**
 * ポーリングを無効化するコードを生成
 */
function generateDisabledCode(originalCode: string, type: string): string {
    // コメントアウトして無効化
    return `// [POLLING-TEST-DISABLED] ${originalCode}`;
}

/**
 * ファイルの特定行を一時的に置き換え
 */
function disablePollingInFile(filePath: string, lineNumber: number, originalCode: string): DisableConfig {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // バックアップを作成
    const backupPath = `${filePath}.polling-test-backup`;
    fs.writeFileSync(backupPath, content, "utf-8");

    // 指定行を無効化
    const disabledCode = generateDisabledCode(lines[lineNumber - 1], "setInterval");
    lines[lineNumber - 1] = disabledCode;

    // ファイルを更新
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

    return {
        file: filePath,
        line: lineNumber,
        originalCode,
        disabledCode,
    };
}

/**
 * ファイルを元に戻す
 */
function restoreFile(filePath: string) {
    const backupPath = `${filePath}.polling-test-backup`;

    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        fs.unlinkSync(backupPath);
    }
}

/**
 * テストを実行
 */
function runTests(testFile?: string): { passed: boolean; output: string; } {
    try {
        const testCommand = testFile
            ? `cd client && npm run test:e2e -- ${testFile}`
            : `cd client && npm run test:e2e:basic`;

        const output = execSync(testCommand, {
            encoding: "utf-8",
            stdio: "pipe",
            timeout: 300000, // 5分タイムアウト
        });

        return {
            passed: true,
            output,
        };
    } catch (error: any) {
        return {
            passed: false,
            output: error.stdout || error.stderr || error.message,
        };
    }
}

/**
 * 特定のポーリングを無効化してテスト
 */
async function testWithoutPolling(
    filePath: string,
    lineNumber: number,
    originalCode: string,
    pollingId: string,
    testFile?: string,
): Promise<TestResult> {
    console.log(`\nテスト開始: ${pollingId}`);
    console.log(`  ファイル: ${filePath}:${lineNumber}`);
    console.log(`  コード: ${originalCode.trim()}`);

    let config: DisableConfig | null = null;

    try {
        // ポーリングを無効化
        console.log("  ポーリングを無効化中...");
        config = disablePollingInFile(filePath, lineNumber, originalCode);

        // テストを実行
        console.log("  テストを実行中...");
        const result = runTests(testFile);

        console.log(`  結果: ${result.passed ? "✓ PASSED" : "✗ FAILED"}`);

        return {
            pollingId,
            testPassed: result.passed,
            testOutput: result.output,
        };
    } catch (error: any) {
        console.log(`  エラー: ${error.message}`);

        return {
            pollingId,
            testPassed: false,
            testOutput: "",
            error: error.message,
        };
    } finally {
        // ファイルを元に戻す
        if (config) {
            console.log("  ファイルを復元中...");
            restoreFile(config.file);
        }
    }
}

/**
 * レポートを生成
 */
function generateTestReport(results: TestResult[]): string {
    let md = "# ポーリング無効化テストレポート\n\n";
    md += `生成日時: ${new Date().toISOString()}\n\n`;
    md += `## 概要\n\n`;
    md += `- テスト実行数: ${results.length}\n`;
    md += `- 無効化しても成功: ${results.filter(r => r.testPassed).length}\n`;
    md += `- 無効化すると失敗: ${results.filter(r => !r.testPassed).length}\n\n`;

    // 無効化しても成功したポーリング（削除候補）
    const removable = results.filter(r => r.testPassed);
    if (removable.length > 0) {
        md += `## 削除可能なポーリング\n\n`;
        md += `これらのポーリングは無効化してもテストが成功しました。削除を検討できます。\n\n`;

        for (const result of removable) {
            md += `### ${result.pollingId}\n\n`;
            md += `- **テスト結果**: ✓ PASSED\n`;
            md += `- **推奨**: このポーリングは削除しても問題ない可能性が高いです\n\n`;
        }
    }

    // 無効化すると失敗したポーリング（必要）
    const necessary = results.filter(r => !r.testPassed);
    if (necessary.length > 0) {
        md += `## 必要なポーリング\n\n`;
        md += `これらのポーリングは無効化するとテストが失敗しました。削除すべきではありません。\n\n`;

        for (const result of necessary) {
            md += `### ${result.pollingId}\n\n`;
            md += `- **テスト結果**: ✗ FAILED\n`;
            md += `- **推奨**: このポーリングは必要です\n`;
            if (result.error) {
                md += `- **エラー**: ${result.error}\n`;
            }
            md += `\n`;
        }
    }

    return md;
}

/**
 * メイン処理
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log("使用方法:");
        console.log("  npm run test:polling -- <polling-report.json>");
        console.log("");
        console.log("まず analyze-polling.ts を実行してポーリングレポートを生成してください。");
        process.exit(1);
    }

    const reportPath = args[0];

    if (!fs.existsSync(reportPath)) {
        console.error(`エラー: レポートファイルが見つかりません: ${reportPath}`);
        process.exit(1);
    }

    console.log("ポーリング無効化テストを開始します...\n");

    // レポートを読み込み（JSON形式を想定）
    const reportContent = fs.readFileSync(reportPath, "utf-8");
    const report = JSON.parse(reportContent);

    const results: TestResult[] = [];

    // 疑わしいポーリングのみをテスト
    const suspiciousPolling = report.categorized?.suspicious || [];

    console.log(`テスト対象: ${suspiciousPolling.length}件の疑わしいポーリング\n`);

    for (const polling of suspiciousPolling) {
        const result = await testWithoutPolling(
            polling.file,
            polling.line,
            polling.code,
            polling.id,
        );

        results.push(result);

        // 各テスト間に少し待機
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // レポートを生成
    const markdown = generateTestReport(results);
    const outputPath = path.join(process.cwd(), "docs", "polling-test-report.md");
    fs.writeFileSync(outputPath, markdown, "utf-8");

    console.log(`\nテストレポートを保存しました: ${outputPath}`);

    // サマリーを表示
    console.log("\n=== サマリー ===");
    console.log(`テスト実行数: ${results.length}`);
    console.log(`削除可能: ${results.filter(r => r.testPassed).length}`);
    console.log(`必要: ${results.filter(r => !r.testPassed).length}`);
}

main().catch(console.error);
