#!/usr/bin/env node

/**
 * E2Eテストのカバレッジレポートを生成するスクリプト
 *
 * 使用方法:
 *   node scripts/generate-e2e-coverage.js
 *
 * 前提条件:
 *   - E2Eテストが COVERAGE=true で実行済みであること
 *   - coverage/e2e/raw/ にカバレッジデータが存在すること
 */

import fs from "fs";
import { CoverageReport } from "monocart-coverage-reports";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, "../..");
const rawCoverageDir = path.join(workspaceDir, "coverage", "e2e", "raw");
const e2eCoverageDir = path.join(workspaceDir, "coverage", "e2e");

console.log("E2Eカバレッジレポートを生成しています...");

// カバレッジデータが存在するか確認
if (!fs.existsSync(rawCoverageDir)) {
    console.error("エラー: カバレッジデータが見つかりません");
    console.error(`探したパス: ${rawCoverageDir}`);
    console.error("\nまず、以下のコマンドでE2Eテストを実行してください:");
    console.error("  COVERAGE=true npm run test:e2e");
    process.exit(1);
}

const coverageFiles = fs.readdirSync(rawCoverageDir).filter((f) => f.endsWith(".json"));

if (coverageFiles.length === 0) {
    console.error("エラー: カバレッジデータが見つかりません");
    console.error(`探したパス: ${rawCoverageDir}`);
    process.exit(1);
}

console.log(`  ✓ ${coverageFiles.length} 個のカバレッジファイルを見つけました`);

// カバレッジレポート（出力先など）の準備
const coverageReport = new CoverageReport({
    name: "E2E Coverage Report",
    outputDir: e2eCoverageDir,
    // メモリを抑えるため JSON(Istanbul map) と console-summary のみを出力
    reports: ["json", "console-summary"],
    // sourceFilter: ソースマップから抽出されたソースファイルをフィルタリング
    // NOTE: entryFilterは使用しない。V8カバレッジエントリのフィルタリングは
    //       add()前に手動で行う。これにより、monocart-coverage-reportsの
    //       内部処理でJavaScriptファイルが除外される問題を回避する。
    sourceFilter: (sourcePath) => {
        // node_modules/を除外
        // NOTE: sourcePathはファイル名のみの場合とフルパスの場合がある
        //       ファイル名のみの場合は、全て含める（entryFilterで既にフィルタリング済み）
        if (sourcePath.includes("/node_modules/") || sourcePath.includes("node_modules/")) {
            return false;
        }
        // 全て含める（entryFilterで既にsrc/配下のみに絞り込み済み）
        return true;
    },
});

// 大量メモリ消費を避けるため、ファイルごとに逐次 add して解放する
let totalEntries = 0;
let jsEntries = 0;
let cssEntries = 0;
for (const file of coverageFiles) {
    const filePath = path.join(rawCoverageDir, file);
    const text = fs.readFileSync(filePath, "utf8");
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error(`JSON のパースに失敗しました: ${filePath}`);
        console.error(e);
        process.exit(1);
    }

    // 期待フォーマット: V8(Array) または Istanbul(Object)。それ以外はスキップ
    if (Array.isArray(data)) {
        // V8カバレッジデータを手動でフィルタリング
        // NOTE: monocart-coverage-reportsのentryFilterを使用すると、
        //       JavaScriptファイルが除外される問題があるため、
        //       add()前に手動でフィルタリングを行う
        const filtered = data.filter((entry) => {
            const url = entry?.url || "";
            // src/配下のファイルのみを対象とする（node_modules/を除外）
            // 空のURLは除外（匿名スクリプト）
            if (!url) return false;
            if (url.includes("/node_modules/")) return false;
            // src/配下のファイルまたはCSSファイルを含める
            return url.includes("/src/");
        });

        totalEntries += data.length;
        // JavaScriptとCSSのエントリ数をカウント
        for (const entry of filtered) {
            const url = entry?.url || "";
            if (url.includes(".css")) {
                cssEntries++;
            } else {
                jsEntries++;
            }
        }

        if (filtered.length > 0) {
            await coverageReport.add(filtered);
        }
    } else if (data && typeof data === "object") {
        // Istanbul 形式（オブジェクト）の場合はそのまま追加
        await coverageReport.add(data);
        // 件数は不明なので合算しない
    } else {
        console.warn(`[MCR] Skip unsupported coverage format: ${filePath}`);
    }
}

console.log(`  ✓ ${totalEntries} 個のカバレッジエントリを読み込みました`);
console.log(`    - JavaScript: ${jsEntries} 個`);
console.log(`    - CSS: ${cssEntries} 個`);

try {
    await coverageReport.generate();
    console.log("\n✓ E2Eカバレッジレポートの生成が完了しました");
    const istanbulJson = path.join(e2eCoverageDir, "coverage-final.json");
    if (fs.existsSync(istanbulJson)) {
        console.log(`\nIstanbul JSON: ${istanbulJson}`);

        // カバレッジ変換の検証: JavaScriptファイルが含まれているか確認
        console.log("\nカバレッジ変換の検証を実行しています...");
        const coverageData = JSON.parse(fs.readFileSync(istanbulJson, "utf8"));
        const files = Object.keys(coverageData);
        const jsFiles = files.filter((f) => !f.includes(".css"));
        const cssFiles = files.filter((f) => f.includes(".css"));

        console.log(`  - 総ファイル数: ${files.length}`);
        console.log(`  - JavaScriptファイル: ${jsFiles.length}`);
        console.log(`  - CSSファイル: ${cssFiles.length}`);

        // JavaScriptエントリが存在したのにJavaScriptファイルが0の場合はエラー
        if (jsEntries > 0 && jsFiles.length === 0) {
            console.error("\n❌ エラー: JavaScriptファイルのカバレッジが変換時に失われました");
            console.error(`   rawカバレッジには ${jsEntries} 個のJavaScriptエントリが存在しましたが、`);
            console.error("   変換後のカバレッジにはJavaScriptファイルが含まれていません。");
            console.error("\n   これは monocart-coverage-reports の設定に問題がある可能性があります。");
            console.error("   entryFilter と sourceFilter の設定を確認してください。");
            process.exit(1);
        }

        // 警告: JavaScriptファイルが少ない場合
        if (jsEntries > 0 && jsFiles.length < jsEntries * 0.1) {
            console.warn("\n⚠️  警告: JavaScriptファイルの数が予想より少ないです");
            console.warn(`   rawカバレッジ: ${jsEntries} 個のJavaScriptエントリ`);
            console.warn(`   変換後: ${jsFiles.length} 個のJavaScriptファイル`);
            console.warn("   一部のファイルが除外されている可能性があります。");
        }

        console.log("\n✓ カバレッジ変換の検証が完了しました");
    } else {
        // MCR の json 出力ファイル名が異なる場合に備えて、トップレベルの .json を探索して coverage-final.json として保存
        const candidates = fs
            .readdirSync(e2eCoverageDir)
            .filter((f) => f.endsWith(".json") && f !== "coverage-final.json");
        if (candidates.length > 0) {
            const src = path.join(e2eCoverageDir, candidates[0]);
            fs.copyFileSync(src, istanbulJson);
            console.warn(`[MCR] 注意: ${candidates[0]} を coverage-final.json にコピーしました`);
            console.log(`\nIstanbul JSON: ${istanbulJson}`);
        } else {
            console.log(`\n出力先: ${e2eCoverageDir}`);
            console.warn("[MCR] 注意: coverage-final.json が見つかりません。json 出力名の確認が必要です。");
        }
    }
} catch (error) {
    console.error("エラー: カバレッジレポートの生成に失敗しました:", error);
    process.exit(1);
}
