#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// テストディレクトリのパス（コマンドライン引数で指定）
const testDir = process.argv[2] || path.join(__dirname, "../client/e2e/core");

// データ一致チェックが不要なテストファイル
const excludeFiles = [
    "auth-test.spec.ts",
    "basic-navigation.spec.ts",
    "browser-test.spec.ts",
    "chromium-debug.spec.ts",
    "debug-page-load.spec.ts",
    "env-variable-check.spec.ts",
    "homepage-auth.spec.ts",
    "network-test.spec.ts",
    "outliner-no-auth.spec.ts",
    "playwright-sanity.spec.ts",
    "port.spec.ts",
    "toolbar-search-box-display.spec.ts",
    "cht-chart-component-1b7a8eff.spec.ts",
];

function fixValidationPlacement(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    // DataValidationHelpersのインポートがない場合はスキップ
    if (!content.includes('import { DataValidationHelpers } from "../utils/dataValidationHelpers"')) {
        return { status: "no_import", fixed: 0 };
    }

    const lines = content.split("\n");
    let fixedCount = 0;

    // テストケースを検出して修正
    let inTestCase = false;
    let testStartLine = -1;
    let braceCount = 0;
    let testName = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // テストケースの開始を検出
        const testMatch = line.match(
            /^\s*test\s*\(\s*["']([^"']*)["']\s*,\s*async\s*\(\s*{\s*page\s*}\s*\)\s*=>\s*{\s*$/,
        );
        if (testMatch) {
            inTestCase = true;
            testStartLine = i;
            testName = testMatch[1];
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
                const testLines = lines.slice(testStartLine, i + 1);
                const testContent = testLines.join("\n");

                // データ一致チェックの位置を確認
                const validationCalls = [];
                for (let j = testStartLine; j <= i; j++) {
                    if (lines[j].includes("DataValidationHelpers.validateDataConsistency(page)")) {
                        validationCalls.push(j - testStartLine);
                    }
                }

                // 最後にデータ一致チェックがない場合は追加
                const hasValidationAtEnd = validationCalls.some(pos => pos > (i - testStartLine) * 0.8);

                if (validationCalls.length > 0 && !hasValidationAtEnd) {
                    // テストの最後にデータ一致チェックを追加
                    lines.splice(
                        i,
                        0,
                        "",
                        "        // FluidとYjsのデータ整合性を確認",
                        "        await DataValidationHelpers.validateDataConsistency(page);",
                    );
                    i += 3; // 追加した行数分インデックスを調整
                    fixedCount++;
                    console.log(`  ✅ Fixed test: "${testName}"`);
                }

                inTestCase = false;
                testStartLine = -1;
                braceCount = 0;
                testName = "";
            }
        }
    }

    if (fixedCount > 0) {
        const newContent = lines.join("\n");
        fs.writeFileSync(filePath, newContent, "utf8");
    }

    return { status: "fixed", fixed: fixedCount };
}

function main() {
    console.log(`🔧 Fixing data validation placement in test files: ${testDir}...\n`);

    const files = fs.readdirSync(testDir)
        .filter(file => file.endsWith(".spec.ts"))
        .filter(file => !excludeFiles.includes(file));

    let totalFiles = 0;
    let fixedFiles = 0;
    let totalFixes = 0;

    for (const file of files) {
        const filePath = path.join(testDir, file);

        try {
            const result = fixValidationPlacement(filePath);
            totalFiles++;

            if (result.status === "no_import") {
                console.log(`⚠️  ${file} - No DataValidationHelpers import`);
                continue;
            }

            if (result.fixed > 0) {
                fixedFiles++;
                totalFixes += result.fixed;
                console.log(`✅ ${file} - Fixed ${result.fixed} test case(s)`);
            } else {
                console.log(`✅ ${file} - Already OK`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total files processed: ${totalFiles}`);
    console.log(`   Files fixed: ${fixedFiles}`);
    console.log(`   Total test cases fixed: ${totalFixes}`);
}

if (require.main === module) {
    main();
}
