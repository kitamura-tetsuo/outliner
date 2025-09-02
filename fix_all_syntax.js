#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 修正対象のディレクトリ
const directories = ["client/e2e/core", "client/e2e/new"];

function fixFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, "utf8");
        let modified = false;

        // ファイルを行に分割
        let lines = content.split("\n");
        let fixedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // 空行をスキップ（最後の行以外）
            if (trimmed === "" && i < lines.length - 1) {
                // 連続する空行を1つにまとめる
                if (fixedLines.length > 0 && fixedLines[fixedLines.length - 1].trim() !== "") {
                    fixedLines.push("");
                }
                continue;
            }

            // 不適切な構造を修正
            if (trimmed.match(/^.*;\s*}\);\s*$/)) {
                // expect(...);    }); のようなパターンを分割
                const parts = line.split(/\s*}\);\s*$/);
                if (parts.length === 2 && parts[1] === "") {
                    fixedLines.push(parts[0] + ";");
                    fixedLines.push("    });");
                    modified = true;
                } else {
                    fixedLines.push(line);
                }
            } else if (trimmed.match(/^.*[^;]\s*}\);\s*$/)) {
                // その他の不適切なパターン
                const parts = line.split(/\s*}\);\s*$/);
                if (parts.length === 2 && parts[1] === "") {
                    fixedLines.push(parts[0]);
                    fixedLines.push("    });");
                    modified = true;
                } else {
                    fixedLines.push(line);
                }
            } else {
                fixedLines.push(line);
            }
        }

        // 末尾の空行を整理
        while (fixedLines.length > 0 && fixedLines[fixedLines.length - 1].trim() === "") {
            fixedLines.pop();
            modified = true;
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
console.log("Starting comprehensive syntax fix...");

for (const dir of directories) {
    if (fs.existsSync(dir)) {
        console.log(`Processing directory: ${dir}`);
        processDirectory(dir);
    } else {
        console.log(`Directory not found: ${dir}`);
    }
}

console.log("Comprehensive syntax fix completed.");
