#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// 各フォルダのパス設定
const folders = [
    { name: "core", path: "client/e2e/core", importPath: "../utils/dataValidationHelpers" },
    { name: "new", path: "client/e2e/new", importPath: "../utils/dataValidationHelpers" },
    { name: "basic", path: "client/e2e/basic", importPath: "../utils/dataValidationHelpers" },
    { name: "utils", path: "client/e2e/utils", importPath: "./dataValidationHelpers" },
];

function hasDataValidationImport(content, importPath) {
    return content.includes(`import { DataValidationHelpers } from "${importPath}"`);
}

function hasDataValidationCall(content) {
    return content.includes("DataValidationHelpers.validateDataConsistency(page)");
}

function hasTestHelpersImport(content) {
    return content.includes('from "../utils/testHelpers"') || content.includes('from "./testHelpers"');
}

function addDataValidationToFile(filePath, importPath) {
    const content = fs.readFileSync(filePath, "utf8");

    // 既にvalidateDataConsistencyの呼び出しがある場合はスキップ
    if (hasDataValidationCall(content)) {
        return false;
    }

    // TestHelpersのインポートがない場合はスキップ
    if (!hasTestHelpersImport(content)) {
        console.log(`⚠️  ${path.basename(filePath)} - No TestHelpers import found, skipping`);
        return false;
    }

    let newContent = content;

    // DataValidationHelpersのインポートを追加（まだない場合）
    if (!hasDataValidationImport(content, importPath)) {
        // TestHelpersのインポート行を見つけて、その後に追加
        const testHelpersRegex = /import { ([^}]+) } from ["']([^"']*testHelpers)["'];/;
        const match = newContent.match(testHelpersRegex);

        if (match) {
            const replacement = `import { ${match[1]} } from "${match[2]}";
import { DataValidationHelpers } from "${importPath}";`;
            newContent = newContent.replace(testHelpersRegex, replacement);
        }
    }

    // test()関数を見つけて、その終了直前にvalidateDataConsistencyを追加
    const testRegex = /test\s*\(\s*["'][^"']*["']\s*,\s*async\s*\(\s*{\s*page[^}]*}\s*\)\s*=>\s*{/g;
    let match;
    let hasChanges = false;
    let offset = 0;

    // 全てのtest()関数を処理
    while ((match = testRegex.exec(content)) !== null) {
        const testStart = match.index + offset;
        const testStartInNewContent = testStart;

        // テスト関数の終了位置を見つける
        let braceCount = 1;
        let pos = testStartInNewContent + match[0].length;
        let testEnd = -1;

        while (pos < newContent.length && braceCount > 0) {
            const char = newContent[pos];
            if (char === "{") braceCount++;
            else if (char === "}") braceCount--;

            if (braceCount === 0) {
                testEnd = pos;
                break;
            }
            pos++;
        }

        if (testEnd !== -1) {
            // テスト内容を取得
            const testContent = newContent.substring(testStartInNewContent, testEnd + 1);

            // 既にデータ一致チェックがあるかチェック
            if (!testContent.includes("DataValidationHelpers.validateDataConsistency(page)")) {
                // テストの終了直前にデータ一致チェックを追加
                const beforeClosing = newContent.substring(0, testEnd);
                const afterClosing = newContent.substring(testEnd);

                const validationCode = `
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    `;

                newContent = beforeClosing + validationCode + afterClosing;
                hasChanges = true;

                // オフセットを調整
                offset += validationCode.length;

                // 正規表現の位置をリセット
                testRegex.lastIndex = 0;
            }
        }
    }

    if (hasChanges) {
        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(`✅ ${path.basename(filePath)} - Added data validation checks`);
        return true;
    } else {
        console.log(`⚠️  ${path.basename(filePath)} - No changes needed`);
        return false;
    }
}

function main() {
    console.log("🔍 Fixing missing data validation checks...\n");

    let totalProcessed = 0;
    let totalSkipped = 0;

    for (const folder of folders) {
        console.log(`\n📁 Processing ${folder.name} folder...`);

        // 欠けているファイルを特定
        const missingFiles = [];
        try {
            const output = execSync(
                `find ${folder.path} -name "*.spec.ts" | while read file; do if ! grep -q "validateDataConsistency" "$file"; then echo "$file"; fi; done`,
                { encoding: "utf8" },
            );

            if (output.trim()) {
                missingFiles.push(...output.trim().split("\n"));
            }
        } catch (error) {
            console.error(`Error finding missing files in ${folder.name}:`, error.message);
            continue;
        }

        console.log(`Found ${missingFiles.length} files missing validation checks`);

        let processed = 0;
        let skipped = 0;

        for (const filePath of missingFiles) {
            if (!filePath.trim()) continue;

            try {
                const success = addDataValidationToFile(filePath, folder.importPath);
                if (success) {
                    processed++;
                } else {
                    skipped++;
                }
            } catch (error) {
                console.error(`❌ Error processing ${path.basename(filePath)}:`, error.message);
                skipped++;
            }
        }

        console.log(`   Processed: ${processed} files`);
        console.log(`   Skipped: ${skipped} files`);

        totalProcessed += processed;
        totalSkipped += skipped;
    }

    console.log(`\n📊 Overall Summary:`);
    console.log(`   Total Processed: ${totalProcessed} files`);
    console.log(`   Total Skipped: ${totalSkipped} files`);
}

if (require.main === module) {
    main();
}
