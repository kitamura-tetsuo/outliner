#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 修正対象のディレクトリ
const directories = ["client/e2e/core", "client/e2e/new"];

function fixFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, "utf8");
        let modified = false;

        // 不適切な });    }); パターンを修正
        const badPattern1 = /([^;])\s+}\);\s*\n}\);\s*$/gm;
        if (badPattern1.test(content)) {
            content = content.replace(badPattern1, "$1\n    });\n});");
            modified = true;
        }

        // 末尾の余分な空行を削除
        const originalLength = content.length;
        content = content.replace(/\n+$/, "\n");
        if (content.length !== originalLength) {
            modified = true;
        }

        // 特定のパターンを修正: expect(...);    }); -> expect(...); \n    });
        const badPattern2 = /([^;])\s+}\);\s*$/gm;
        const lines = content.split("\n");
        let fixedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // expect(...);    }); のようなパターンを検出
            if (line.match(/.*;\s+}\);\s*$/)) {
                const parts = line.split(/\s+}\);\s*$/);
                if (parts.length === 2 && parts[1] === "") {
                    fixedLines.push(parts[0] + ";");
                    fixedLines.push("    });");
                    modified = true;
                } else {
                    fixedLines.push(line);
                }
            } else {
                fixedLines.push(line);
            }
        }

        if (modified) {
            content = fixedLines.join("\n");
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
console.log("Starting syntax error fix...");

for (const dir of directories) {
    if (fs.existsSync(dir)) {
        console.log(`Processing directory: ${dir}`);
        processDirectory(dir);
    } else {
        console.log(`Directory not found: ${dir}`);
    }
}

console.log("Syntax error fix completed.");
