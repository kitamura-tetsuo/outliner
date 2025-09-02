#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 修正対象のディレクトリ
const directories = ["client/e2e/core", "client/e2e/new"];

function fixFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, "utf8");
        let modified = false;

        // 特定の問題パターンを修正
        const fixes = [
            // 1. 不適切な行結合を修正: "text            const" -> "text\n        const"
            {
                pattern: /([^;])\s+const\s+/g,
                replacement: "$1\n        const ",
            },
            // 2. 不適切な行結合を修正: "text            await" -> "text\n        await"
            {
                pattern: /([^;])\s+await\s+/g,
                replacement: "$1\n        await ",
            },
            // 3. 不適切な });    }); パターンを修正
            {
                pattern: /([^;])\s+}\);\s*$/gm,
                replacement: "$1\n    });",
            },
            // 4. 不適切な click({ force: true    }); パターンを修正
            {
                pattern: /click\(\{\s*force:\s*true\s+}\);\s*$/gm,
                replacement: "click({ force: true });",
            },
            // 5. 不適切な screenshot({ path: "..."    }); パターンを修正
            {
                pattern: /screenshot\(\{\s*path:\s*"([^"]+)"\s+}\);\s*$/gm,
                replacement: 'screenshot({ path: "$1" });',
            },
            // 6. 不適切な filter({ hasText: /.*/ パターンを修正
            {
                pattern: /filter\(\{\s*hasText:\s*\/\.\*\/\s*$/gm,
                replacement: "filter({ hasText: /.*/ })",
            },
        ];

        for (const fix of fixes) {
            const newContent = content.replace(fix.pattern, fix.replacement);
            if (newContent !== content) {
                content = newContent;
                modified = true;
            }
        }

        // 行ベースの修正
        const lines = content.split("\n");
        const fixedLines = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // 不適切な行結合を検出して修正
            if (line.includes("            ") && !line.trim().startsWith("//")) {
                // 複数のスペースで結合された行を分割
                const parts = line.split(/\s{12,}/);
                if (parts.length > 1) {
                    fixedLines.push(parts[0]);
                    for (let j = 1; j < parts.length; j++) {
                        if (parts[j].trim()) {
                            fixedLines.push("        " + parts[j].trim());
                        }
                    }
                    modified = true;
                    continue;
                }
            }

            // 不適切な });    }); パターンを修正
            if (line.match(/.*;\s+}\);\s*$/)) {
                const parts = line.split(/\s+}\);\s*$/);
                if (parts.length === 2 && parts[1] === "") {
                    fixedLines.push(parts[0] + ";");
                    fixedLines.push("    });");
                    modified = true;
                    continue;
                }
            }

            fixedLines.push(line);
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
console.log("Starting broken syntax fix...");

for (const dir of directories) {
    if (fs.existsSync(dir)) {
        console.log(`Processing directory: ${dir}`);
        processDirectory(dir);
    } else {
        console.log(`Directory not found: ${dir}`);
    }
}

console.log("Broken syntax fix completed.");
