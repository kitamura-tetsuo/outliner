const fs = require("fs");
const path = require("path");

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes("node_modules") && !file.includes(".git")) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith(".ts") || file.endsWith(".svelte") || file.endsWith(".md")) {
                if (!file.includes(".ja.") && !file.includes("ime-")) {
                    const content = fs.readFileSync(file, "utf8");
                    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(content)) {
                        results.push(file);
                    }
                }
            }
        }
    });
    return results;
}

const files = walk("./client/e2e/core");
console.log(files.slice(10, 20).join("\n"));
