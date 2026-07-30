const fs = require("fs");
const content = fs.readFileSync("client/src/services/importExportService.ts", "utf8");
console.log(content.substring(0, 1000));
