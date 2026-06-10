const fs = require('fs');

let content = fs.readFileSync('client/src/stores/EditorOverlayStore.svelte.ts', 'utf-8');

content = content.replace(/\(currentPage\.items as any\)/g, '(currentPage.items as unknown as { iterateUnordered?: () => Iterable<unknown> })');

fs.writeFileSync('client/src/stores/EditorOverlayStore.svelte.ts', content);
