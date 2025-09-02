// @ts-nocheck
import { test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { compareTestCaseSnapshots } from "./snapshotComparison.js";

/**
 * スナップショット比較のためのテストフック
 * 各テストファイルの実行後にfluid/yjsのスナップショット比較を実行する
 */

// テストケース名とプロジェクト名を追跡するためのグローバル変数
let currentTestCases = new Set<string>();
let completedProjects = new Set<string>();

/**
 * テストケース名を登録する
 */
export function registerTestCase(testCaseName: string, projectName: string) {
    currentTestCases.add(testCaseName);
    console.log(`🔧 [SnapshotHooks] Registered test case: ${testCaseName} (${projectName})`);
}

/**
 * プロジェクトの完了を記録し、必要に応じてスナップショット比較を実行する
 */
export function markProjectCompleted(projectName: string) {
    completedProjects.add(projectName);
    console.log(`🔧 [SnapshotHooks] Project completed: ${projectName}`);

    // fluid/yjsの両方のプロジェクトが完了した場合、スナップショット比較を実行
    const hasFluid = Array.from(completedProjects).some(p => p.includes("fluid"));
    const hasYjs = Array.from(completedProjects).some(p => p.includes("yjs"));

    if (hasFluid && hasYjs) {
        console.log(`🔧 [SnapshotHooks] Both fluid and yjs projects completed, starting comparison...`);
        performSnapshotComparison();
        // 比較後にリセット
        currentTestCases.clear();
        completedProjects.clear();
    }
}

/**
 * スナップショット比較を実行
 */
async function performSnapshotComparison() {
    console.log("\n📊 [SnapshotComparison] Starting immediate snapshot comparison...");

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
    console.log(`\n📊 [SnapshotComparison] Immediate Summary:`);
    console.log(`   Total comparisons: ${totalComparisons}`);
    console.log(`   Successful: ${successfulComparisons}`);
    console.log(`   Failed: ${failedComparisons}`);

    if (failedComparisons > 0) {
        console.log(`\n❌ [SnapshotComparison] Failed test cases:`);
        failedTests.forEach(testCase => {
            console.log(`   - ${testCase}`);
        });
    }

    // 比較結果をファイルに保存（タイムスタンプ付き）
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(snapshotsDir, `comparison-report-${timestamp}.json`);
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

/**
 * テストファイル用のafterAllフック
 * 各テストファイルの最後に呼び出される
 */
export function setupSnapshotComparison() {
    test.afterAll(async ({}, testInfo) => {
        const projectName = testInfo.project.name;
        console.log(`🔧 [SnapshotHooks] Test file completed for project: ${projectName}`);
        markProjectCompleted(projectName);
    });
}
