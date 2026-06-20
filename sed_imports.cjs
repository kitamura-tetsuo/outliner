const fs = require('fs');

const path = 'client/src/lib/cursor/CursorSelection.ts';
let content = fs.readFileSync(path, 'utf8');

const importStatement = `import { getCurrentLineIndex, getLineStartOffset, getLineEndOffset } from "../cursor";\n`;

content = content.replace(/(import .* from ".*";\n)(?!import)/, `$1${importStatement}`);

fs.writeFileSync(path, content);
