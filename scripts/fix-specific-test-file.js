#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 特定のファイルを修正する関数
function fixSpecificFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    // 既にインポートがある場合はスキップ
    if (!content.includes('import { DataValidationHelpers } from "../utils/dataValidationHelpers"')) {
        console.log(`⚠️  ${path.basename(filePath)} - No DataValidationHelpers import found`);
        return false;
    }

    // 各テストケースの最後にデータ一致チェックを追加
    const lines = content.split("\n");
    let inTestCase = false;
    let testStartLine = -1;
    let braceCount = 0;
    let hasChanges = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // テストケースの開始を検出
        if (line.match(/^\s*test\s*\(\s*["'][^"']*["']\s*,\s*async\s*\(\s*{\s*page\s*}\s*\)\s*=>\s*{\s*$/)) {
            inTestCase = true;
            testStartLine = i;
            braceCount = 1;
            continue;
        }

        if (inTestCase) {
            // 中括弧をカウント
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            braceCount += openBraces - closeBraces;

            // テストケースの終了を検出
            if (braceCount === 0 && line.match(/^\s*}\s*\)\s*;\s*$/)) {
                // テストケース内にデータ一致チェックがあるかチェック
                const testLines = lines.slice(testStartLine, i + 1);
                const testContent = testLines.join("\n");

                if (!testContent.includes("DataValidationHelpers.validateDataConsistency(page)")) {
                    // データ一致チェックを追加
                    lines.splice(
                        i,
                        0,
                        "",
                        "        // FluidとYjsのデータ整合性を確認",
                        "        await DataValidationHelpers.validateDataConsistency(page);",
                    );
                    i += 3; // 追加した行数分インデックスを調整
                    hasChanges = true;
                    console.log(`✅ Added validation to test case ending at line ${i - 2}`);
                }

                inTestCase = false;
                testStartLine = -1;
                braceCount = 0;
            }
        }
    }

    if (hasChanges) {
        const newContent = lines.join("\n");
        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(`✅ ${path.basename(filePath)} - Fixed data validation checks`);
        return true;
    } else {
        console.log(`⚠️  ${path.basename(filePath)} - No changes needed`);
        return false;
    }
}

// コマンドライン引数からファイルパスを取得
const filePath = process.argv[2];
if (!filePath) {
    console.error("Usage: node fix-specific-test-file.js <file-path>");
    process.exit(1);
}

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

console.log(`🔧 Fixing file: ${filePath}`);
fixSpecificFile(filePath);
