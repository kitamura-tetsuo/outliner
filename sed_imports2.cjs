const fs = require("fs");

const path = "client/src/lib/cursor/CursorFormatting.ts";
let content = fs.readFileSync(path, "utf8");

const importStatement = `import { searchItem } from "../cursor";\n`;

content = content.replace(/(import .* from ".*";\n)(?!import)/, `$1${importStatement}`);

fs.writeFileSync(path, content);
