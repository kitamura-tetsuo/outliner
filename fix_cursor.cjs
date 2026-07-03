const fs = require('fs');
const content = fs.readFileSync('client/src/lib/Cursor.ts', 'utf8');
const updated = content
    .replace(/\s*\/\/\s*TODO:\s*.*$/gm, '')
    .replace(/\s*\/\/\s*FIXME:\s*.*$/gm, '')
    .replace(/\s*\/\/\s*todo:\s*.*$/gim, '')
    .replace(/\s*\/\/\s*fixme:\s*.*$/gim, '');
fs.writeFileSync('client/src/lib/Cursor.ts', updated);
