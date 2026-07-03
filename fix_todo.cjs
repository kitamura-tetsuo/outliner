const fs = require('fs');

const path = 'client/src/lib/Cursor.ts';
let content = fs.readFileSync(path, 'utf8');

// The main goal is to remove trailing // TODO or // FIXME comments.
// A safe regex that matches // followed by optional whitespace and TODO/FIXME at the end of a line:
content = content.replace(/\s*\/\/\s*(TODO|FIXME)[\s:a-zA-Z0-9.,-]*$/gmi, '');

fs.writeFileSync(path, content);
