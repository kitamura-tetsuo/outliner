const fs = require('fs');

const path = 'client/src/routes/[project]/[page]/schedule/+page.svelte';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/foundPageRef = p;/g, 'foundPageRef = p as unknown as Item;');

fs.writeFileSync(path, content);
