#!/usr/bin/env tsx

/**
 * スナップショット比較スクリプト
 * FluidモードとYjsモードのスナップショットを比較し、データの整合性を確認する
 */

import fs from "fs";
import path from "path";
import { compareTestCaseSnapshots, printComparisonResult } from "../e2e/utils/snapshotComparison.ts";

/**
 * タイムスタンプを除いた基本テスト名を抽出
 * 例: "Test-Fluid-snapshot-capture-auto-1756167312997" -> "Test-Fluid-snapshot-capture"
 */
function extractBaseTestName(fullName: string): string {
    // "auto-" で始まるタイムスタンプ部分を除去
    const autoIndex = fullName.lastIndexOf("-auto-");
    if (autoIndex !== -1) {
        return fullName.substring(0, autoIndex);
    }

    // タイムスタンプのパターンを検出して除去（数字13桁以上）
    const timestampPattern = /-\d{13,}$/;
    return fullName.replace(timestampPattern, "");
}

function main() {
    const snapshotsDir = path.join(process.cwd(), "e2e-snapshots");

    if (!fs.existsSync(snapshotsDir)) {
        console.error("❌ Snapshots directory not found:", snapshotsDir);
        process.exit(1);
    }

    // スナップショットファイルを検索
    const files = fs.readdirSync(snapshotsDir);
    const fluidFiles = new Map<string, string>();
    const yjsFiles = new Map<string, string>();

    // ファイルを分類し、基本テスト名でグループ化
    files.forEach(file => {
        if (file.endsWith("-fluid.json")) {
            // タイムスタンプを除いた基本テスト名を抽出
            const baseName = extractBaseTestName(file.replace("-fluid.json", ""));
            fluidFiles.set(baseName, file);
        } else if (file.endsWith("-yjs.json")) {
            // タイムスタンプを除いた基本テスト名を抽出
            const baseName = extractBaseTestName(file.replace("-yjs.json", ""));
            yjsFiles.set(baseName, file);
        }
    });

    // マッチするテストケースを見つける
    const testCases = new Set<string>();
    fluidFiles.forEach((_, baseName) => {
        if (yjsFiles.has(baseName)) {
            testCases.add(baseName);
        }
    });

    console.log(`🔍 Found ${testCases.size} test cases to compare:`);
    testCases.forEach(testCase => console.log(`  - ${testCase}`));
    console.log("");

    let totalTests = 0;
    let passedTests = 0;

    // 各テストケースを比較
    for (const baseName of testCases) {
        const fluidFile = fluidFiles.get(baseName)!;
        const yjsFile = yjsFiles.get(baseName)!;
        const fluidPath = path.join(snapshotsDir, fluidFile);
        const yjsPath = path.join(snapshotsDir, yjsFile);

        console.log(`🔍 Comparing: ${baseName}`);
        console.log(`  Fluid: ${fluidFile}`);
        console.log(`  Yjs:   ${yjsFile}`);

        totalTests++;

        try {
            const result = compareTestCaseSnapshots(fluidPath, yjsPath);

            if (result.success) {
                console.log(`[${baseName}] ✅ Snapshots match perfectly!`);
                passedTests++;
            } else {
                console.log(`[${baseName}] ❌ Snapshots do not match:`);
                printComparisonResult(result);
            }
        } catch (error) {
            console.log(`[${baseName}] ❌ Error comparing snapshots:`, error);
        }

        console.log(""); // 空行を追加
    }

    // 結果サマリー
    console.log("=".repeat(50));
    console.log(`📊 Comparison Summary:`);
    console.log(`  Total test cases: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${totalTests - passedTests}`);
    console.log(`  Success rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);

    if (passedTests === totalTests && totalTests > 0) {
        console.log("🎉 All snapshots match perfectly!");
        process.exit(0);
    } else {
        console.log("❌ Some snapshots do not match.");
        process.exit(1);
    }
}

// ESモジュールでの実行チェック
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
