#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// 各フォルダのパス設定
const folders = [
    "client/e2e/core",
    "client/e2e/new",
    "client/e2e/basic",
    "client/e2e/utils",
];

function fixSyntaxErrors(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    let newContent = content;
    let hasChanges = false;

    // パターン1: expect(...);});  -> expect(...); + validation + });
    const pattern1 = /expect\([^;]+\);}\);/g;
    if (pattern1.test(content)) {
        newContent = newContent.replace(pattern1, (match) => {
            const expectStatement = match.replace("});", "");
            return `${expectStatement}

        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });`;
        });
        hasChanges = true;
    }

    // パターン2: コメント行の後に});  -> コメント + validation + });
    const pattern2 = /\/\/[^}]+}\);/g;
    if (pattern2.test(content)) {
        newContent = newContent.replace(pattern2, (match) => {
            const commentLine = match.replace("});", "");
            return `${commentLine}

        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });`;
        });
        hasChanges = true;
    }

    // パターン3: その他の不正な});パターン
    const pattern3 = /([^}])\s*}\);$/gm;
    const lines = newContent.split("\n");
    let fixedLines = [];
    let inTestCase = false;
    let testBraceCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // テストケースの開始を検出
        if (line.includes("test(") && line.includes("async") && line.includes("{")) {
            inTestCase = true;
            testBraceCount = 1;
            fixedLines.push(line);
            continue;
        }

        if (inTestCase) {
            // 中括弧をカウント
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            testBraceCount += openBraces - closeBraces;

            // 不正な終了パターンをチェック
            if (testBraceCount === 0 && line.match(/^\s*}\);?\s*$/)) {
                // 前の行が不正に終了している場合
                const prevLine = fixedLines[fixedLines.length - 1];
                if (prevLine && (prevLine.endsWith("});") || prevLine.includes("});"))) {
                    // 前の行を修正
                    const fixedPrevLine = prevLine.replace(/}\);?\s*$/, "");
                    fixedLines[fixedLines.length - 1] = fixedPrevLine;

                    // データ一致チェックを追加
                    fixedLines.push("");
                    fixedLines.push("        // FluidとYjsのデータ整合性を確認");
                    fixedLines.push("        await DataValidationHelpers.validateDataConsistency(page);");
                    fixedLines.push("    });");
                    hasChanges = true;
                } else {
                    fixedLines.push(line);
                }
                inTestCase = false;
                testBraceCount = 0;
            } else {
                fixedLines.push(line);
            }
        } else {
            fixedLines.push(line);
        }
    }

    if (hasChanges) {
        newContent = fixedLines.join("\n");
    }

    if (hasChanges) {
        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(`✅ ${path.basename(filePath)} - Fixed syntax errors`);
        return true;
    } else {
        return false;
    }
}

function main() {
    console.log("🔧 Fixing syntax errors in test files...\n");

    let totalFixed = 0;

    for (const folder of folders) {
        console.log(`\n📁 Processing ${folder}...`);

        // 全てのテストファイルを取得
        const allFiles = [];
        try {
            const output = execSync(`find ${folder} -name "*.spec.ts"`, { encoding: "utf8" });
            if (output.trim()) {
                allFiles.push(...output.trim().split("\n"));
            }
        } catch (error) {
            console.error(`Error finding files in ${folder}:`, error.message);
            continue;
        }

        let fixed = 0;

        for (const filePath of allFiles) {
            if (!filePath.trim()) continue;

            try {
                const success = fixSyntaxErrors(filePath);
                if (success) {
                    fixed++;
                }
            } catch (error) {
                console.error(`❌ Error processing ${path.basename(filePath)}:`, error.message);
            }
        }

        console.log(`   Fixed: ${fixed} files`);
        totalFixed += fixed;
    }

    console.log(`\n📊 Overall Summary:`);
    console.log(`   Total Fixed: ${totalFixed} files`);
}

if (require.main === module) {
    main();
}
