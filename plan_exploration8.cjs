const fs = require("fs");
const content = fs.readFileSync("client/src/services/importExportService.ts", "utf8");

const match = content.match(/export function exportProjectToMarkdown[\s\S]*?return lines.join\("\\n"\);\n\}/);
console.log(match ? match[0] : "not found");
