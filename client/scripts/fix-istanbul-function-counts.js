#!/usr/bin/env node

/**
 * V8カバレッジからIstanbul形式への変換時に失われた関数実行回数を修正するスクリプト
 *
 * 問題:
 * monocart-coverage-reportsがV8カバレッジをIstanbul形式に変換する際、
 * イベントハンドラやコールバックの実行回数が正しく変換されない。
 *
 * 解決策:
 * V8カバレッジの生データから関数実行回数を抽出し、
 * Istanbul形式のカバレッジデータに反映する。
 *
 * 使用方法:
 *   node scripts/fix-istanbul-function-counts.js
 *
 * 前提条件:
 *   - coverage/e2e/raw/ にV8カバレッジデータが存在すること
 *   - coverage/e2e/coverage-final.json にIstanbul形式のカバレッジデータが存在すること
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// client/scripts から実行される場合と workspace から実行される場合の両方に対応
const isInClientDir = __dirname.includes("/client/scripts");
const workspaceDir = isInClientDir ? path.resolve(__dirname, "../..") : path.resolve(__dirname, "..");
const rawCoverageDir = path.join(workspaceDir, "coverage", "e2e", "raw");
const istanbulCoverageFile = path.join(workspaceDir, "coverage", "e2e", "coverage-final.json");

console.log("V8カバレッジからIstanbul形式への関数実行回数の修正を開始します...");

// V8カバレッジデータが存在するか確認
if (!fs.existsSync(rawCoverageDir)) {
    console.error("エラー: V8カバレッジデータが見つかりません");
    console.error(`探したパス: ${rawCoverageDir}`);
    process.exit(1);
}

// Istanbul形式のカバレッジデータが存在するか確認
if (!fs.existsSync(istanbulCoverageFile)) {
    console.error("エラー: Istanbul形式のカバレッジデータが見つかりません");
    console.error(`探したパス: ${istanbulCoverageFile}`);
    process.exit(1);
}

// V8カバレッジデータから関数実行回数を抽出
const coverageFiles = fs.readdirSync(rawCoverageDir).filter((f) => f.endsWith(".json"));
console.log(`  ✓ ${coverageFiles.length} 個のV8カバレッジファイルを見つけました`);

// URLから正規化されたファイル名を取得
function normalizeUrl(url) {
    // http://localhost:7090/src/components/OutlinerItem.svelte?t=1760180780335
    // -> OutlinerItem.svelte
    const match = url.match(/\/src\/[^?]+/);
    if (!match) return null;
    const filePath = match[0].substring(5); // "/src/" を除去
    return path.basename(filePath);
}

// V8カバレッジから関数実行回数を抽出
const functionCounts = new Map(); // Map<fileName, Map<functionName, count>>

for (const file of coverageFiles) {
    const filePath = path.join(rawCoverageDir, file);
    const text = fs.readFileSync(filePath, "utf8");
    let data;
    try {
        data = JSON.parse(text);
    } catch (_) {
        console.error(`JSON のパースに失敗しました: ${filePath}`);
        continue;
    }

    if (!Array.isArray(data)) continue;

    for (const entry of data) {
        const url = entry?.url || "";
        if (!url.includes("/src/")) continue;

        const fileName = normalizeUrl(url);
        if (!fileName) continue;

        if (!functionCounts.has(fileName)) {
            functionCounts.set(fileName, new Map());
        }
        const fileFunctionCounts = functionCounts.get(fileName);

        for (const func of entry.functions || []) {
            const functionName = func.functionName;
            if (!functionName) continue;

            // V8カバレッジでは、関数の実行回数は最初のrangeのcountに記録されている
            const ranges = func.ranges || [];
            if (ranges.length === 0) continue;

            const count = ranges[0].count || 0;

            // 既存のカウントと比較して、大きい方を採用（複数のテストファイルで実行される場合）
            const existingCount = fileFunctionCounts.get(functionName) || 0;
            if (count > existingCount) {
                fileFunctionCounts.set(functionName, count);
            }
        }
    }
}

console.log(`  ✓ ${functionCounts.size} 個のファイルから関数実行回数を抽出しました`);

// Istanbul形式のカバレッジデータを読み込み
const istanbulCoverage = JSON.parse(fs.readFileSync(istanbulCoverageFile, "utf8"));

// 関数実行回数を修正
let totalFixed = 0;
let totalFunctions = 0;

for (const [filePath, coverage] of Object.entries(istanbulCoverage)) {
    const fileName = path.basename(filePath);
    const fileFunctionCounts = functionCounts.get(fileName);
    if (!fileFunctionCounts) continue;

    const fnMap = coverage.fnMap || {};
    const f = coverage.f || {};

    for (const [fnId, fnInfo] of Object.entries(fnMap)) {
        totalFunctions++;
        const functionName = fnInfo.name;
        const v8Count = fileFunctionCounts.get(functionName);

        if (v8Count !== undefined && v8Count !== f[fnId]) {
            const oldCount = f[fnId];
            f[fnId] = v8Count;
            totalFixed++;

            if (oldCount === 0 && v8Count > 0) {
                console.log(
                    `  修正: ${fileName} - ${functionName}: ${oldCount} -> ${v8Count}`,
                );
            }
        }
    }
}

console.log(`  ✓ ${totalFunctions} 個の関数のうち ${totalFixed} 個の実行回数を修正しました`);

// 修正したカバレッジデータを保存
fs.writeFileSync(istanbulCoverageFile, JSON.stringify(istanbulCoverage, null, 2));
console.log(`  ✓ ${istanbulCoverageFile} に保存しました`);

console.log("\n✓ 関数実行回数の修正が完了しました");

// 修正された関数の一覧を表示
if (totalFixed > 0) {
    console.log("\n修正された関数:");
    for (const [filePath, coverage] of Object.entries(istanbulCoverage)) {
        const fileName = path.basename(filePath);
        const fileFunctionCounts = functionCounts.get(fileName);
        if (!fileFunctionCounts) continue;

        const fnMap = coverage.fnMap || {};
        const f = coverage.f || {};

        for (const [fnId, fnInfo] of Object.entries(fnMap)) {
            const functionName = fnInfo.name;
            const v8Count = fileFunctionCounts.get(functionName);

            if (v8Count !== undefined && v8Count > 0 && f[fnId] === v8Count) {
                console.log(`  - ${fileName}:${fnInfo.loc.start.line} ${functionName} (${v8Count}回)`);
            }
        }
    }
}
