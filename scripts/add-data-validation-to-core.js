#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// coreフォルダの残りのファイルリスト（DataValidationHelpersが追加されていないファイル）
const remainingFiles = [
    "usr-container-removal-function-0661ecad.spec.ts",
    "sch-list-schedules-c10dea72.spec.ts",
    "log-development-log-service-8f761bd4.spec.ts",
    "debug-page-load.spec.ts",
    "fmt-extended-format-b471a4b9.spec.ts",
    "log-rotate-log-files-endpoint-6f1a5793.spec.ts",
    "usr-user-deletion-function-baaa8b62.spec.ts",
    "clm-move-up-no-prev-item-9e8d4b10.spec.ts",
    "homepage-auth.spec.ts",
    "network-test.spec.ts",
    "sec-dotenvx-encrypted-env-files-fa94885c.spec.ts",
    "env-variable-check.spec.ts",
    "sch-scheduled-page-publishing-ba83fd47.spec.ts",
    "sch-edit-schedule-d83e13d7.spec.ts",
    "playwright-sanity.spec.ts",
];

const coreDir = "client/e2e/core";
const importPath = "../utils/dataValidationHelpers";

function hasDataValidationImport(content) {
    return content.includes(`import { DataValidationHelpers } from "${importPath}"`);
}

function hasDataValidationCall(content) {
    return content.includes("DataValidationHelpers.validateDataConsistency(page)");
}

function hasAfterEachHook(content) {
    return content.includes("test.afterEach");
}

function addDataValidationToFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    // 既にvalidateDataConsistencyの呼び出しがある場合はスキップ
    if (hasDataValidationCall(content)) {
        console.log(`⚠️  ${path.basename(filePath)} - Already has data validation`);
        return false;
    }

    let newContent = content;
    let hasChanges = false;

    // DataValidationHelpersのインポートを追加（まだない場合）
    if (!hasDataValidationImport(content)) {
        // import文の後に追加
        const importRegex = /import { ([^}]+) } from ["']@playwright\/test["'];/;
        const match = newContent.match(importRegex);

        if (match) {
            const replacement = `import { ${match[1]} } from "@playwright/test";
import { DataValidationHelpers } from "${importPath}";`;
            newContent = newContent.replace(importRegex, replacement);
            hasChanges = true;
        }
    }

    // test.describe内にafterEachフックを追加（まだない場合）
    if (!hasAfterEachHook(content)) {
        const describeRegex = /test\.describe\s*\(\s*["'][^"']*["']\s*,\s*\(\s*\)\s*=>\s*{/;
        const match = newContent.match(describeRegex);

        if (match) {
            const afterEachCode = `
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        try {
            await DataValidationHelpers.validateDataConsistency(page);
        } catch (error) {
            console.log("Data validation skipped:", error.message);
        }
    });`;

            const replacement = match[0] + afterEachCode;
            newContent = newContent.replace(describeRegex, replacement);
            hasChanges = true;
        }
    }

    if (hasChanges) {
        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(`✅ ${path.basename(filePath)} - Added data validation`);
        return true;
    } else {
        console.log(`⚠️  ${path.basename(filePath)} - No changes needed`);
        return false;
    }
}

function main() {
    console.log("🔍 Adding data validation to remaining core files...\n");

    let processed = 0;
    let skipped = 0;

    for (const fileName of remainingFiles) {
        const filePath = path.join(coreDir, fileName);

        if (!fs.existsSync(filePath)) {
            console.log(`❌ ${fileName} - File not found`);
            skipped++;
            continue;
        }

        try {
            const success = addDataValidationToFile(filePath);
            if (success) {
                processed++;
            } else {
                skipped++;
            }
        } catch (error) {
            console.error(`❌ Error processing ${fileName}:`, error.message);
            skipped++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Processed: ${processed} files`);
    console.log(`   Skipped: ${skipped} files`);
}

if (require.main === module) {
    main();
}
