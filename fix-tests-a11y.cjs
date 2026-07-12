const fs = require('fs');

const f1 = 'client/src/tests/integration/sea-page-title-search-box-late-load-7c89d6ef.integration.spec.ts';
let c1 = fs.readFileSync(f1, 'utf8');
c1 = c1.replace(/{ name: "second page" }/g, '{ name: "Go to page second page" }');
fs.writeFileSync(f1, c1);

const f2 = 'client/src/tests/integration/sea-page-title-search-box-a3674e4f-dce0-4543-9e85-1f1899f97f73.integration.spec.ts';
let c2 = fs.readFileSync(f2, 'utf8');
c2 = c2.replace(/{ name: "second page" }/g, '{ name: "Go to page second page" }');
fs.writeFileSync(f2, c2);
