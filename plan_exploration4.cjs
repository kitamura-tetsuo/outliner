const fs = require('fs');
const content = fs.readFileSync('client/src/stores/store.svelte.ts', 'utf8');

// find all imports to see if we can import snapshotService
const imports = content.match(/^import .* from .*/gm);
console.log(imports.join('\n'));
