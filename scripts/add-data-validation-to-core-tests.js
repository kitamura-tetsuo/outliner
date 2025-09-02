#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// coreテストディレクトリのパス
const coreTestDir = path.join(__dirname, "../client/e2e/core");

// データ一致チェックが不要なテストファイル（認証、ナビゲーション、ブラウザテストなど）
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
    "cht-chart-component-1b7a8eff.spec.ts", // チャートコンポーネントテスト
];

// データ一致チェックが既に追加済みのファイル
const completedFiles = [
    "MOB-0003.spec.ts",
    "app-set-focus-to-global-text-area-when-viewing-project-pages-d14affb9.spec.ts",
    "clm-cursor-visible-c22414b4.spec.ts",
    "api-admin-check-for-container-user-listing-bada0e86.spec.ts",
    "api-admin-user-list-569aaa6c.spec.ts",
    "api-firebase-emulator-startup-standby-function-c9fa9c85.spec.ts",
    "api-fixing-firebase-functions-api-server-9e65d78b.spec.ts",
    "att-drag-and-drop-attachments-11f8904b.spec.ts",
    "clm-click-non-alt-edit-11765b4f.spec.ts",
    "clm-cursor-blink-61a641e7.spec.ts",
    "clm-cursor-count-stable-after-drag-1cef29b1.spec.ts",
    "clm-cursor-duplication-and-input-distribution-problems-when-moving-between-items-be4c0ba6.spec.ts",
    "clm-cursor-manipulation-with-format-strings-86f0d787.spec.ts",
    "clm-cursor-position-aa9e87f6.spec.ts",
    "clm-dictionary-key-handler-59169a01.spec.ts",
];

function hasDataValidationImport(content) {
    return content.includes('import { DataValidationHelpers } from "../utils/dataValidationHelpers"');
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
    const testHelpersImportMatch = content.match(/import { ([^}]+) } from ["']\.\.\/utils\/testHelpers["'];/);
    if (!testHelpersImportMatch) {
        console.log(`⚠️  ${path.basename(filePath)} - No TestHelpers import found, skipping`);
        return false;
    }

    let newContent = content;

    // DataValidationHelpersのインポートを追加（まだない場合）
    if (!hasDataValidationImport(content)) {
        newContent = newContent.replace(
            /import { ([^}]+) } from ["']\.\.\/utils\/testHelpers["'];/,
            `import { $1 } from "../utils/testHelpers";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";`,
        );
    }

    // より堅牢なアプローチ：test()関数の終了を検出
    const testRegex = /test\s*\(\s*["'][^"']*["']\s*,\s*async\s*\(\s*{\s*page\s*}\s*\)\s*=>\s*{/g;
    let match;
    let hasChanges = false;
    let processedContent = newContent;

    while ((match = testRegex.exec(newContent)) !== null) {
        const testStart = match.index;
        const testStartLine = newContent.substring(0, testStart).split("\n").length - 1;

        // テスト関数の終了位置を見つける
        let braceCount = 1;
        let pos = match.index + match[0].length;
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
            const testContent = newContent.substring(testStart, testEnd + 1);

            // 既にデータ一致チェックがあるかチェック
            if (!testContent.includes("DataValidationHelpers.validateDataConsistency(page)")) {
                // テストの終了直前にデータ一致チェックを追加
                const beforeClosing = newContent.substring(0, testEnd);
                const afterClosing = newContent.substring(testEnd);

                const validationCode = `
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    `;

                processedContent = beforeClosing + validationCode + afterClosing;
                hasChanges = true;

                // 次の検索のために正規表現の位置を調整
                testRegex.lastIndex = testEnd + validationCode.length;
                newContent = processedContent;
            }
        }
    }

    if (hasChanges) {
        fs.writeFileSync(filePath, processedContent, "utf8");
        console.log(`✅ ${path.basename(filePath)} - Added data validation checks`);
        return true;
    } else {
        console.log(`⚠️  ${path.basename(filePath)} - No test cases found or already has validation`);
        return false;
    }
}

function main() {
    console.log("🔍 Scanning core test files for data validation...\n");

    const files = fs.readdirSync(coreTestDir)
        .filter(file => file.endsWith(".spec.ts"))
        .filter(file => !excludeFiles.includes(file))
        .filter(file => !completedFiles.includes(file));

    console.log(`Found ${files.length} files to process:\n`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
        const filePath = path.join(coreTestDir, file);

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
