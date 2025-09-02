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

function hasAfterEachValidation(content) {
    return content.includes("test.afterEach")
        && content.includes("DataValidationHelpers.validateDataConsistency(page)");
}

function hasTestHelpersImport(content) {
    return content.includes('from "../utils/testHelpers"') || content.includes('from "./testHelpers"');
}

function hasTestDescribe(content) {
    return content.includes("test.describe(");
}

function addAfterEachValidation(filePath, importPath) {
    const content = fs.readFileSync(filePath, "utf8");

    // 既にafterEachでvalidateDataConsistencyがある場合はスキップ
    if (hasAfterEachValidation(content)) {
        return false;
    }

    // TestHelpersのインポートがない場合はスキップ
    if (!hasTestHelpersImport(content)) {
        console.log(`⚠️  ${path.basename(filePath)} - No TestHelpers import found, skipping`);
        return false;
    }

    // test.describe()がない場合はスキップ
    if (!hasTestDescribe(content)) {
        console.log(`⚠️  ${path.basename(filePath)} - No test.describe found, skipping`);
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

    // test.describe()ブロックを見つけて、beforeEachの後にafterEachを追加
    const describeRegex = /test\.describe\([^{]+{\s*([\s\S]*?)\s*}\);/;
    const describeMatch = newContent.match(describeRegex);

    if (describeMatch) {
        const describeContent = describeMatch[1];

        // beforeEachがある場合は、その後にafterEachを追加
        const beforeEachRegex = /(test\.beforeEach\([^{]+{\s*[\s\S]*?\s*}\);)/;
        const beforeEachMatch = describeContent.match(beforeEachRegex);

        if (beforeEachMatch) {
            const afterEachCode = `
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });`;

            const newDescribeContent = describeContent.replace(
                beforeEachMatch[1],
                beforeEachMatch[1] + afterEachCode,
            );

            newContent = newContent.replace(describeContent, newDescribeContent);
        } else {
            // beforeEachがない場合は、describe内の最初にafterEachを追加
            const afterEachCode = `    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
`;

            const newDescribeContent = afterEachCode + describeContent;
            newContent = newContent.replace(describeContent, newDescribeContent);
        }

        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(`✅ ${path.basename(filePath)} - Added afterEach data validation`);
        return true;
    } else {
        console.log(`⚠️  ${path.basename(filePath)} - Could not find test.describe block`);
        return false;
    }
}

function removeInlineValidation(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    // インラインのvalidateDataConsistency呼び出しを削除
    const inlineValidationRegex =
        /\s*\/\/ FluidとYjsのデータ整合性を確認\s*\n\s*await DataValidationHelpers\.validateDataConsistency\(page\);\s*/g;

    const newContent = content.replace(inlineValidationRegex, "");

    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(`🧹 ${path.basename(filePath)} - Removed inline validation calls`);
        return true;
    }

    return false;
}

function main() {
    console.log("🔄 Converting to afterEach-based data validation...\n");

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalCleaned = 0;

    for (const folder of folders) {
        console.log(`\n📁 Processing ${folder.name} folder...`);

        // 全てのテストファイルを取得
        const allFiles = [];
        try {
            const output = execSync(`find ${folder.path} -name "*.spec.ts"`, { encoding: "utf8" });
            if (output.trim()) {
                allFiles.push(...output.trim().split("\n"));
            }
        } catch (error) {
            console.error(`Error finding files in ${folder.name}:`, error.message);
            continue;
        }

        console.log(`Found ${allFiles.length} test files`);

        let processed = 0;
        let skipped = 0;
        let cleaned = 0;

        for (const filePath of allFiles) {
            if (!filePath.trim()) continue;

            try {
                // まず、インラインのvalidation呼び出しを削除
                const cleanResult = removeInlineValidation(filePath);
                if (cleanResult) cleaned++;

                // afterEachベースのvalidationを追加
                const success = addAfterEachValidation(filePath, folder.importPath);
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

        console.log(`   Added afterEach: ${processed} files`);
        console.log(`   Cleaned inline: ${cleaned} files`);
        console.log(`   Skipped: ${skipped} files`);

        totalProcessed += processed;
        totalSkipped += skipped;
        totalCleaned += cleaned;
    }

    console.log(`\n📊 Overall Summary:`);
    console.log(`   Total Added afterEach: ${totalProcessed} files`);
    console.log(`   Total Cleaned inline: ${totalCleaned} files`);
    console.log(`   Total Skipped: ${totalSkipped} files`);
}

if (require.main === module) {
    main();
}
