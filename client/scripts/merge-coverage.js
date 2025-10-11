#!/usr/bin/env node

/**
 * カバレッジレポートを統合するスクリプト
 *
 * unit/integration/e2eテストのカバレッジを統合し、
 * 統一されたレポートを生成します。
 *
 * 使用方法:
 *   node scripts/merge-coverage.js
 *
 * 前提条件:
 *   - unit/integration/e2eテストが実行済みであること
 *   - 各テストのカバレッジデータが生成されていること
 */

import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libCoverage = require("istanbul-lib-coverage");
const libReport = require("istanbul-lib-report");
const reports = require("istanbul-reports");

// カバレッジディレクトリのパス
const workspaceDir = path.resolve(__dirname, "../..");
const coverageDir = path.join(workspaceDir, "coverage");
const unitAndIntegrationCoverageFile = path.join(coverageDir, "unit_and_integration", "coverage-final.json");
const e2eCoverageFile = path.join(coverageDir, "e2e", "coverage-final.json");
const mergedCoverageFile = path.join(coverageDir, "merged", "coverage-final.json");
const mergedReportDir = path.join(coverageDir, "merged");

console.log("カバレッジレポートの統合を開始します...");

// カバレッジマップを作成
const coverageMap = libCoverage.createCoverageMap();

// 各カバレッジファイルを読み込んで統合
let filesFound = 0;
const coverageSources = [];

// Unit/Integrationテストのカバレッジを追加
// Vitestは全プロジェクトのカバレッジを1つのファイルに統合します
if (fs.existsSync(unitAndIntegrationCoverageFile)) {
    console.log("Unit/Integrationテストのカバレッジを読み込んでいます...");
    const unitAndIntegrationCoverage = JSON.parse(fs.readFileSync(unitAndIntegrationCoverageFile, "utf8"));
    const files = Object.keys(unitAndIntegrationCoverage);
    const jsFiles = files.filter((f) => !f.includes(".css"));
    const cssFiles = files.filter((f) => f.includes(".css"));

    coverageMap.merge(unitAndIntegrationCoverage);
    filesFound++;
    coverageSources.push({
        name: "Unit/Integration",
        totalFiles: files.length,
        jsFiles: jsFiles.length,
        cssFiles: cssFiles.length,
    });
    console.log(`  ✓ ${files.length} ファイルのカバレッジを追加しました`);
    console.log(`    - JavaScript: ${jsFiles.length} 個`);
    console.log(`    - CSS: ${cssFiles.length} 個`);
} else {
    console.log("  ⚠ Unit/Integrationテストのカバレッジが見つかりません");
    console.log(`     探したパス: ${unitAndIntegrationCoverageFile}`);
}

// E2Eテストのカバレッジを追加
if (fs.existsSync(e2eCoverageFile)) {
    console.log("E2Eテストのカバレッジを読み込んでいます...");
    const e2eCoverage = JSON.parse(fs.readFileSync(e2eCoverageFile, "utf8"));
    const files = Object.keys(e2eCoverage);
    const jsFiles = files.filter((f) => !f.includes(".css"));
    const cssFiles = files.filter((f) => f.includes(".css"));

    coverageMap.merge(e2eCoverage);
    filesFound++;
    coverageSources.push({
        name: "E2E",
        totalFiles: files.length,
        jsFiles: jsFiles.length,
        cssFiles: cssFiles.length,
    });
    console.log(`  ✓ ${files.length} ファイルのカバレッジを追加しました`);
    console.log(`    - JavaScript: ${jsFiles.length} 個`);
    console.log(`    - CSS: ${cssFiles.length} 個`);

    // E2Eカバレッジの検証: JavaScriptファイルが含まれているか確認
    if (jsFiles.length === 0 && cssFiles.length > 0) {
        console.error("\n❌ エラー: E2EカバレッジにJavaScriptファイルが含まれていません");
        console.error("   CSSファイルのみが含まれています。");
        console.error("   これは E2E カバレッジ生成時に問題が発生した可能性があります。");
        console.error("\n   以下を確認してください:");
        console.error("   1. scripts/generate-e2e-coverage.js の entryFilter 設定");
        console.error("   2. scripts/generate-e2e-coverage.js の sourceFilter 設定");
        console.error("   3. monocart-coverage-reports のバージョン");
        process.exit(1);
    }
} else {
    console.log("  ⚠ E2Eテストのカバレッジが見つかりません");
    console.log(`     探したパス: ${e2eCoverageFile}`);
}

if (filesFound === 0) {
    console.error("\nエラー: カバレッジファイルが見つかりませんでした");
    console.error("まず、以下のコマンドでテストを実行してください:");
    console.error("  npm run test:unit");
    console.error("  npm run test:integration");
    console.error("  COVERAGE=true npm run test:e2e");
    process.exit(1);
}

// 統合されたカバレッジを保存
console.log("\n統合されたカバレッジを保存しています...");
fs.mkdirSync(mergedReportDir, { recursive: true });
fs.writeFileSync(mergedCoverageFile, JSON.stringify(coverageMap.toJSON(), null, 2));
console.log(`  ✓ ${mergedCoverageFile} に保存しました`);

// レポートを生成
console.log("\nレポートを生成しています...");
const context = libReport.createContext({
    dir: mergedReportDir,
    coverageMap: coverageMap,
});

// HTML レポート
console.log("  - HTML レポート");
const htmlReport = reports.create("html", {});
htmlReport.execute(context);

// テキスト レポート (コンソール出力)
console.log("  - テキスト レポート");
const textReport = reports.create("text", {});
textReport.execute(context);

// LCOV レポート (CI/CD用)
console.log("  - LCOV レポート");
const lcovReport = reports.create("lcov", {});
lcovReport.execute(context);

// JSON レポート
console.log("  - JSON レポート");
const jsonReport = reports.create("json", {});
jsonReport.execute(context);

console.log("\n✓ カバレッジレポートの統合が完了しました");
console.log(`\nレポートの場所: ${mergedReportDir}/index.html`);

// カバレッジソースのサマリーを表示
if (coverageSources.length > 0) {
    console.log("\nカバレッジソース:");
    for (const source of coverageSources) {
        console.log(`  ${source.name}:`);
        console.log(`    - 総ファイル数: ${source.totalFiles}`);
        console.log(`    - JavaScript: ${source.jsFiles} 個`);
        console.log(`    - CSS: ${source.cssFiles} 個`);
    }
}

console.log("\nカバレッジサマリー:");

// サマリーを表示
const summary = coverageMap.getCoverageSummary();
console.log(
    `  Statements   : ${
        summary.statements.pct.toFixed(2)
    }% ( ${summary.statements.covered}/${summary.statements.total} )`,
);
console.log(
    `  Branches     : ${summary.branches.pct.toFixed(2)}% ( ${summary.branches.covered}/${summary.branches.total} )`,
);
console.log(
    `  Functions    : ${summary.functions.pct.toFixed(2)}% ( ${summary.functions.covered}/${summary.functions.total} )`,
);
console.log(`  Lines        : ${summary.lines.pct.toFixed(2)}% ( ${summary.lines.covered}/${summary.lines.total} )`);
