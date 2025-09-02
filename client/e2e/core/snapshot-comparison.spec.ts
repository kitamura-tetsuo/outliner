// @ts-nocheck
import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { DataValidationHelpers } from "../utils/dataValidationHelpers.js";
import { compareTestCaseSnapshots } from "../utils/snapshotComparison.js";
import { TestHelpers } from "../utils/testHelpers.js";

/**
 * スナップショット比較テスト
 * FluidモードとYjsモードでスナップショットを生成し、後で比較する
 */
test.describe("Snapshot Comparison", () => {
    test("generate and save snapshot for comparison", async ({ page }, testInfo) => {
        // テスト環境を準備
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "これはテスト用のページです。1",
            "これはテスト用のページです。2",
            "内部リンクのテスト: [test-link]",
        ]);

        // 現在のモードを取得
        const mode = await page.evaluate(() => localStorage.getItem("OUTLINER_MODE") || "fluid");
        console.log(`🔧 [SnapshotTest] Current mode: ${mode}`);

        // テストケース名を生成（プロジェクト名とページ名から）
        const testCaseName = `snapshot-comparison-${Date.now()}`;

        // スナップショットを生成して保存
        await DataValidationHelpers.saveSnapshotsAndCompare(page, testCaseName);

        // スナップショットファイルが作成されたことを確認
        const snapshotsDir = path.resolve(process.cwd(), "e2e-snapshots");
        const snapshotPath = path.join(snapshotsDir, `${testCaseName}-${mode}.json`);

        // ファイルの存在を確認
        expect(fs.existsSync(snapshotPath)).toBe(true);

        console.log(`✅ [SnapshotTest] Snapshot saved for ${mode} mode: ${snapshotPath}`);

        // スナップショットの内容を検証
        const snapshotContent = fs.readFileSync(snapshotPath, "utf-8");
        const snapshot = JSON.parse(snapshotContent);

        // 基本的な構造を検証
        expect(snapshot).toHaveProperty("projectTitle");
        expect(snapshot).toHaveProperty("pages");
        expect(Array.isArray(snapshot.pages)).toBe(true);
        expect(snapshot.pages.length).toBeGreaterThan(0);

        // ページの内容を検証
        const firstPage = snapshot.pages[0];
        expect(firstPage).toHaveProperty("title");
        expect(firstPage).toHaveProperty("items");
        expect(Array.isArray(firstPage.items)).toBe(true);

        console.log(`✅ [SnapshotTest] Snapshot validation passed for ${mode} mode`);

        // テストケース名をグローバル変数に保存（比較テストで使用）
        await page.evaluate((testCase) => {
            window.__LAST_TEST_CASE_NAME__ = testCase;
        }, testCaseName);
    });
});

/**
 * スナップショット比較実行テスト
 * 両方のモードでスナップショットが生成された後に実行される
 */
test.describe("Snapshot Comparison Execution", () => {
    test("compare fluid and yjs snapshots", async ({ page }, testInfo) => {
        // スナップショットディレクトリを確認
        const snapshotsDir = path.resolve(process.cwd(), "e2e-snapshots");

        if (!fs.existsSync(snapshotsDir)) {
            console.log("⚠️  Snapshots directory not found, skipping comparison");
            test.skip();
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
            console.log("⚠️  No matching fluid/yjs snapshot pairs found, skipping comparison");
            test.skip();
            return;
        }

        let totalComparisons = 0;
        let successfulComparisons = 0;
        let failedComparisons = 0;

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
                }
            } catch (error) {
                console.error(`❌ [${testCase}] Error comparing snapshots:`, error.message);
                failedComparisons++;
            }
        }

        // 結果をレポート
        console.log(`\n📊 [SnapshotComparison] Summary:`);
        console.log(`   Total comparisons: ${totalComparisons}`);
        console.log(`   Successful: ${successfulComparisons}`);
        console.log(`   Failed: ${failedComparisons}`);

        // 少なくとも1つの比較が成功していることを確認
        expect(totalComparisons).toBeGreaterThan(0);

        // 比較結果をテストの成功/失敗に反映
        if (failedComparisons > 0) {
            console.log(
                `⚠️  [SnapshotComparison] ${failedComparisons} comparisons failed, but continuing (development mode)`,
            );
            expect(failedComparisons).toBe(0);
        }

        // 成功した比較があることを確認
        expect(successfulComparisons + failedComparisons).toBe(totalComparisons);
    });
});
