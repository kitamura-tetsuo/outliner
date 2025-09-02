#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 修正対象のディレクトリ
const directories = ["client/e2e/core", "client/e2e/new"];

// 修正パターン
const patterns = [
    // page.evaluate内のデータ一致チェックを削除
    {
        search:
            /(\s+)\/\/ FluidとYjsのデータ整合性を確認\s*\n\s*await DataValidationHelpers\.validateDataConsistency\(page\);\s*\n/g,
        replace: "",
    },
    // page.addInitScript内のデータ一致チェックを削除
    {
        search:
            /(\s+)\/\/ FluidとYjsのデータ整合性を確認\s*\n\s*await DataValidationHelpers\.validateDataConsistency\(page\);\s*\n/g,
        replace: "",
    },
    // 単独のデータ一致チェック行を削除
    {
        search:
            /^\s*\/\/ FluidとYjsのデータ整合性を確認\s*\n^\s*await DataValidationHelpers\.validateDataConsistency\(page\);\s*\n/gm,
        replace: "",
    },
    // 不適切な });    }); パターンを修正
    {
        search: /(\s+)}\);\s+}\);\s*$/gm,
        replace: "$1});\n});",
    },
    // 不適切な });    }); パターンを修正（コメント付き）
    {
        search: /([^;])\s+}\);\s*$/gm,
        replace: "$1\n    });\n});",
    },
];

function fixFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, "utf8");
        let modified = false;

        for (const pattern of patterns) {
            const newContent = content.replace(pattern.search, pattern.replace);
            if (newContent !== content) {
                content = newContent;
                modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(filePath, content, "utf8");
            console.log(`Fixed: ${filePath}`);
        }
    } catch (error) {
        console.error(`Error fixing ${filePath}:`, error.message);
    }
}

function processDirectory(dir) {
    try {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                processDirectory(filePath);
            } else if (file.endsWith(".spec.ts")) {
                fixFile(filePath);
            }
        }
    } catch (error) {
        console.error(`Error processing directory ${dir}:`, error.message);
    }
}

// メイン処理
console.log("Starting data validation syntax fix...");

for (const dir of directories) {
    if (fs.existsSync(dir)) {
        console.log(`Processing directory: ${dir}`);
        processDirectory(dir);
    } else {
        console.log(`Directory not found: ${dir}`);
    }
}

console.log("Data validation syntax fix completed.");
