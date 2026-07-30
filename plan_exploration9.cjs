const fs = require("fs");
const content = fs.readFileSync("client/src/stores/store.svelte.ts", "utf8");
const lines = content.split("\n");

const startIndex = lines.findIndex(line => line.includes("function handler(") || line.includes("const handler = ("));
if (startIndex !== -1) {
    for (let i = startIndex; i < Math.min(startIndex + 100, lines.length); i++) {
        console.log(lines[i]);
    }
}
