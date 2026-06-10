const fs = require('fs');
let content = fs.readFileSync('client/src/components/SearchPanel.svelte', 'utf-8');
content = content.replace(/const gs = \(window as Window.*?\)\.generalStore;/g, 'const gs = (window as Window & typeof globalThis & { generalStore?: { currentPage?: { items?: unknown[] } } }).generalStore;');
content = content.replace(/>\{\(m\.page as any\)\.text\?\.toString\?\.\(\)/g, '>{(m.page as unknown as { text?: string }).text?.toString?.()');
content = content.replace(/\?\?\s*\(m\.page as any\)\.text/g, '?? (m.page as unknown as { text?: string }).text');
content = content.replace(/>\{\(m\.item as any\)\.text\?\.toString\?\.\(\)/g, '>{(m.item as unknown as { text?: string }).text?.toString?.()');
content = content.replace(/\?\?\s*\(m\.item as any\)\.text/g, '?? (m.item as unknown as { text?: string }).text');
fs.writeFileSync('client/src/components/SearchPanel.svelte', content);
