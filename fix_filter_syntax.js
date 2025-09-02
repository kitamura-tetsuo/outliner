#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 修正対象のディレクトリ
const directories = ["client/e2e/core", "client/e2e/new"];

function fixFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, "utf8");
        let modified = false;

        // 行ベースの修正
        const lines = content.split("\n");
        const fixedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // filter({ hasText: /.*/ }) の後に不適切な }); がある場合を修正
            if (trimmed.match(/\.filter\(\{\s*hasText:\s*\/\.\*\/\s*\}\)$/)) {
                // 次の行が }); の場合、それを削除して現在の行を完成させる
                if (i + 1 < lines.length && lines[i + 1].trim() === "});") {
                    fixedLines.push(line + ";");
                    i++; // 次の行をスキップ
                    modified = true;
                } else {
                    fixedLines.push(line);
                }
            } // 単独の filter({ hasText: /.*/ }) 行の場合
            else if (trimmed.match(/^\.filter\(\{\s*hasText:\s*\/\.\*\/\s*\}\)$/)) {
                // 次の行が }); の場合、それを削除して現在の行を完成させる
                if (i + 1 < lines.length && lines[i + 1].trim() === "});") {
                    fixedLines.push(line + ";");
                    i++; // 次の行をスキップ
                    modified = true;
                } else {
                    fixedLines.push(line);
                }
            } // const visibleItems = page.locator(...).filter({ hasText: /.*/ }) の後に }); がある場合
            else if (trimmed.match(/const\s+\w+\s*=\s*.*\.filter\(\{\s*hasText:\s*\/\.\*\/\s*\}\)$/)) {
                // 次の行が }); の場合、それを削除して現在の行を完成させる
                if (i + 1 < lines.length && lines[i + 1].trim() === "});") {
                    fixedLines.push(line + ";");
                    i++; // 次の行をスキップ
                    modified = true;
                } else {
                    fixedLines.push(line);
                }
            } // 不適切な }); 行を検出（前の行がfilterで終わっている場合）
            else if (trimmed === "});" && i > 0) {
                const prevLine = lines[i - 1].trim();
                if (prevLine.match(/\.filter\(\{\s*hasText:\s*\/\.\*\/\s*\}\)$/)) {
                    // この行は既に前の行で処理されているのでスキップ
                    continue;
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
console.log("Starting filter syntax fix...");

for (const dir of directories) {
    if (fs.existsSync(dir)) {
        console.log(`Processing directory: ${dir}`);
        processDirectory(dir);
    } else {
        console.log(`Directory not found: ${dir}`);
    }
}

console.log("Filter syntax fix completed.");
