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
    sourceFilter: (sourcePath) => {
        // src/配下のファイルのみをカバレッジ対象とする
        return sourcePath.includes("/src/") && !sourcePath.includes("/node_modules/");
    },
});

// 大量メモリ消費を避けるため、ファイルごとに逐次 add して解放する
let totalEntries = 0;
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
        // 事前に URL で /src/ のみ残す（/node_modules/ や他の匿名スクリプトは破棄）
        const filtered = data.filter((e) => {
            const u = e?.url || "";
            return typeof u === "string" && u.includes("/src/") && !u.includes("/node_modules/");
        });
        totalEntries += filtered.length;
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

try {
    await coverageReport.generate();
    console.log("\n✓ E2Eカバレッジレポートの生成が完了しました");
    const istanbulJson = path.join(e2eCoverageDir, "coverage-final.json");
    if (fs.existsSync(istanbulJson)) {
        console.log(`\nIstanbul JSON: ${istanbulJson}`);
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
