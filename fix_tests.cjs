const fs = require('fs');

let testContent = fs.readFileSync('client/src/schema/app-schema.table.test.ts', 'utf-8');
testContent = testContent.replace(
    /item\.tableRows\.addRow/g,
    `item.initTableRows();\n        item.tableRows.addRow`
);
fs.writeFileSync('client/src/schema/app-schema.table.test.ts', testContent, 'utf-8');
