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

// すべてのカバレッジデータを統合
const allCoverage = [];
for (const file of coverageFiles) {
    const filePath = path.join(rawCoverageDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    allCoverage.push(...data);
}

console.log(`  ✓ ${allCoverage.length} 個のカバレッジエントリを読み込みました`);

// カバレッジレポートを生成
const coverageReport = new CoverageReport({
    name: "E2E Coverage Report",
    outputDir: e2eCoverageDir,
    reports: ["v8", "console-summary", "json", "lcov"],
    sourceFilter: (sourcePath) => {
        // src/配下のファイルのみをカバレッジ対象とする
        return sourcePath.includes("/src/") && !sourcePath.includes("/node_modules/");
    },
});

try {
    await coverageReport.add(allCoverage);
    await coverageReport.generate();
    console.log("\n✓ E2Eカバレッジレポートの生成が完了しました");
    console.log(`\nレポートの場所: ${e2eCoverageDir}/index.html`);
} catch (error) {
    console.error("エラー: カバレッジレポートの生成に失敗しました:", error);
    process.exit(1);
}
