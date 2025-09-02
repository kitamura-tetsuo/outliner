import { ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import pino from "pino";
import { fileURLToPath } from "url";
import { compareTestCaseSnapshots } from "./utils/snapshotComparison.js";

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// pinoロガーを設定
const logger = pino({
    level: "info",
}, pino.destination(path.join(__dirname, "./logs/tinylicious-server.log")));

// グローバル変数の型定義
declare global {
    var __TINYLICIOUS_PROCESS__: ChildProcess | null;
    var __SERVER_PROCESS__: ChildProcess | null;
    var __YJS_SERVER_PROCESS__: ChildProcess | null;
}

// Tinylicious サーバーのポート
const TINYLICIOUS_PORT = process.env.VITE_TINYLICIOUS_PORT || "7082";

/**
 * テスト全体の実行後に1度だけ呼び出される後処理
 */
async function globalTeardown(config: any) {
    console.log("Starting global teardown...");

    // サーバーは停止しない（継続して使用するため）
    console.log("Keeping servers running for continued use...");

    // // 万が一プロセスが残っている場合に備え、ポート7082を使用しているすべてのプロセスを終了
    // try {
    //     console.log(`Finding processes using port ${TINYLICIOUS_PORT}`);
    //     const portNumber = parseInt(TINYLICIOUS_PORT);
    //     const processList = await findProcess("port", portNumber);

    //     if (processList.length > 0) {
    //         console.log(`Found ${processList.length} processes using port ${TINYLICIOUS_PORT}`);

    //         // 各プロセスを強制終了
    //         for (const proc of processList) {
    //             console.log(`Killing process ${proc.pid} (${proc.name}) using port ${TINYLICIOUS_PORT}`);
    //             try {
    //                 process.kill(proc.pid);
    //                 console.log(`Successfully killed process ${proc.pid}`);
    //             }
    //             catch (killError) {
    //                 console.error(`Failed to kill process ${proc.pid}: ${killError}`);
    //             }
    //         }
    //     }
    //     else {
    //         console.log(`No processes found using port ${TINYLICIOUS_PORT}`);
    //     }
    // }
    // catch (error) {
    //     console.error(`Error finding or killing processes on port ${TINYLICIOUS_PORT}:`, error);
    // }

    // console.log("Tinylicious server cleanup completed");

    // 完全に終了するまで少し待機
    // await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("Global teardown completed");
}

/**
 * スナップショット比較を実行
 */
async function performSnapshotComparison() {
    console.log("\n📊 [SnapshotComparison] Starting snapshot comparison...");

    const snapshotsDir = path.resolve(process.cwd(), "e2e-snapshots");

    if (!fs.existsSync(snapshotsDir)) {
        console.log("⚠️  [SnapshotComparison] Snapshots directory not found, skipping comparison");
        return;
    }

    // 利用可能なスナップショットファイルを取得
    const files = fs.readdirSync(snapshotsDir);
    const testCases = new Set<string>();

    // ファイル名からテストケース名を抽出
    for (const file of files) {
        if (file.endsWith("-fluid.json")) {
            const testCase = file.replace("-fluid.json", "");
            const yjsFile = `${testCase}-yjs.json`;
            if (files.includes(yjsFile)) {
                testCases.add(testCase);
            }
        }
    }

    console.log(`🔧 [SnapshotComparison] Found ${testCases.size} test cases with both fluid and yjs snapshots`);

    if (testCases.size === 0) {
        console.log("⚠️  [SnapshotComparison] No matching fluid/yjs snapshot pairs found");
        return;
    }

    let totalComparisons = 0;
    let successfulComparisons = 0;
    let failedComparisons = 0;
    const failedTests: string[] = [];

    // 各テストケースを比較
    for (const testCase of testCases) {
        console.log(`\n🔍 [SnapshotComparison] Comparing: ${testCase}`);
        totalComparisons++;

        try {
            const result = compareTestCaseSnapshots(testCase, snapshotsDir);

            if (result.isMatch) {
                console.log(`✅ [${testCase}] Snapshots match perfectly`);
                successfulComparisons++;
            } else {
                console.log(`❌ [${testCase}] Snapshots differ:`);
                result.differences.forEach(diff => {
                    console.log(`   - ${diff}`);
                });
                failedComparisons++;
                failedTests.push(testCase);
            }
        } catch (error) {
            console.error(`❌ [${testCase}] Error comparing snapshots:`, error.message);
            failedComparisons++;
            failedTests.push(testCase);
        }
    }

    // 結果をレポート
    console.log(`\n📊 [SnapshotComparison] Final Summary:`);
    console.log(`   Total comparisons: ${totalComparisons}`);
    console.log(`   Successful: ${successfulComparisons}`);
    console.log(`   Failed: ${failedComparisons}`);

    if (failedComparisons > 0) {
        console.log(`\n❌ [SnapshotComparison] Failed test cases:`);
        failedTests.forEach(testCase => {
            console.log(`   - ${testCase}`);
        });
    }

    // 比較結果をファイルに保存
    const reportPath = path.join(snapshotsDir, "comparison-report.json");
    const report = {
        timestamp: new Date().toISOString(),
        totalComparisons,
        successfulComparisons,
        failedComparisons,
        failedTests,
        successRate: totalComparisons > 0 ? (successfulComparisons / totalComparisons * 100).toFixed(2) : 0,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 [SnapshotComparison] Report saved: ${reportPath}`);

    if (successfulComparisons > 0) {
        console.log(`🎉 [SnapshotComparison] ${successfulComparisons} snapshots matched successfully!`);
    }

    if (failedComparisons > 0) {
        console.log(
            `⚠️  [SnapshotComparison] ${failedComparisons} snapshots had differences (development mode - not failing build)`,
        );
    }
}

export default globalTeardown;
