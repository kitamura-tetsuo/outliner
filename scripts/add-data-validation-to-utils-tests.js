#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// utilsテストディレクトリのパス
const utilsTestDir = path.join(__dirname, "../client/e2e/utils");

function hasDataValidationImport(content) {
    return content.includes('import { DataValidationHelpers } from "./dataValidationHelpers"');
}

function hasDataValidationCall(content) {
    return content.includes("DataValidationHelpers.validateDataConsistency(page)");
}

function addDataValidationToFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    // 既にvalidateDataConsistencyの呼び出しがある場合はスキップ
    if (hasDataValidationCall(content)) {
        console.log(`✅ ${path.basename(filePath)} - Already has validateDataConsistency calls`);
        return false;
    }

    // TestHelpersのインポートを探す
    const testHelpersImportMatch = content.match(/import { ([^}]+) } from ["']\.\/testHelpers["'];/);
    if (!testHelpersImportMatch) {
        console.log(`⚠️  ${path.basename(filePath)} - No TestHelpers import found, skipping`);
        return false;
    }

    let newContent = content;

    // DataValidationHelpersのインポートを追加（まだない場合）
    if (!hasDataValidationImport(content)) {
        newContent = newContent.replace(
            /import { ([^}]+) } from ["']\.\/testHelpers["'];/,
            `import { $1 } from "./testHelpers";
import { DataValidationHelpers } from "./dataValidationHelpers";`,
        );
    }

    // 各テストケースの最後にデータ一致チェックを追加
    // より柔軟な正規表現でテストケースを検出
    const lines = newContent.split("\n");
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
                }

                inTestCase = false;
                testStartLine = -1;
                braceCount = 0;
            }
        }
    }

    if (hasChanges) {
        newContent = lines.join("\n");
    }

    if (hasChanges) {
        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(`✅ ${path.basename(filePath)} - Added data validation checks`);
        return true;
    } else {
        console.log(`⚠️  ${path.basename(filePath)} - No test cases found or already has validation`);
        return false;
    }
}

function main() {
    console.log("🔍 Scanning utils test files for data validation...\n");

    const files = fs.readdirSync(utilsTestDir)
        .filter(file => file.endsWith(".spec.ts"));

    console.log(`Found ${files.length} files to process:\n`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
        const filePath = path.join(utilsTestDir, file);

        try {
            const success = addDataValidationToFile(filePath);
            if (success) {
                processedCount++;
            } else {
                skippedCount++;
            }
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
            skippedCount++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Processed: ${processedCount} files`);
    console.log(`   Skipped: ${skippedCount} files`);
    console.log(`   Total: ${files.length} files`);
}

if (require.main === module) {
    main();
}
