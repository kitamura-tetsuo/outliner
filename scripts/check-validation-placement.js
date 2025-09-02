#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// coreテストディレクトリのパス
const coreTestDir = path.join(__dirname, "../client/e2e/core");

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

function checkValidationPlacement(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    // DataValidationHelpersのインポートがない場合はスキップ
    if (!content.includes('import { DataValidationHelpers } from "../utils/dataValidationHelpers"')) {
        return { status: "no_import", issues: [] };
    }

    const lines = content.split("\n");
    let issues = [];
    let testCases = [];

    // テストケースを検出
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

                testCases.push({
                    name: testName,
                    startLine: testStartLine,
                    endLine: i,
                    validationCalls: validationCalls,
                    hasValidationAtEnd: validationCalls.some(pos => pos > (i - testStartLine) * 0.8), // 最後の20%以内にあるか
                });

                // 最後にデータ一致チェックがない場合は問題として記録
                if (validationCalls.length > 0 && !validationCalls.some(pos => pos > (i - testStartLine) * 0.8)) {
                    issues.push({
                        testName: testName,
                        startLine: testStartLine + 1,
                        endLine: i + 1,
                        issue: "validation_not_at_end",
                        validationLines: validationCalls.map(pos => testStartLine + pos + 1),
                    });
                }

                inTestCase = false;
                testStartLine = -1;
                braceCount = 0;
                testName = "";
            }
        }
    }

    return {
        status: issues.length > 0 ? "has_issues" : "ok",
        issues: issues,
        testCases: testCases,
    };
}

function main() {
    console.log("🔍 Checking data validation placement in core test files...\n");

    const files = fs.readdirSync(coreTestDir)
        .filter(file => file.endsWith(".spec.ts"))
        .filter(file => !excludeFiles.includes(file));

    let totalFiles = 0;
    let filesWithIssues = 0;
    let totalIssues = 0;

    for (const file of files) {
        const filePath = path.join(coreTestDir, file);

        try {
            const result = checkValidationPlacement(filePath);
            totalFiles++;

            if (result.status === "no_import") {
                console.log(`⚠️  ${file} - No DataValidationHelpers import`);
                continue;
            }

            if (result.status === "has_issues") {
                filesWithIssues++;
                console.log(`❌ ${file} - ${result.issues.length} issue(s):`);

                for (const issue of result.issues) {
                    totalIssues++;
                    console.log(
                        `   Test "${issue.testName}" (lines ${issue.startLine}-${issue.endLine}): ${issue.issue}`,
                    );
                    console.log(`   Validation calls at lines: ${issue.validationLines.join(", ")}`);
                }
                console.log("");
            } else {
                console.log(`✅ ${file} - OK (${result.testCases.length} test cases)`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total files checked: ${totalFiles}`);
    console.log(`   Files with issues: ${filesWithIssues}`);
    console.log(`   Total issues: ${totalIssues}`);
}

if (require.main === module) {
    main();
}
