const fs = require('fs');

let content = fs.readFileSync('client/src/stores/EditorOverlayStore.svelte.ts', 'utf-8');

// Replace (window as any) with correct structural type
const windowAnyReplacement = '(window as Window & typeof globalThis & { DEBUG_MODE?: boolean, generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown> } } }, itemsStore?: unknown, editorStore?: { currentItems?: { id: string, [key: string]: unknown }[] }, appStore?: { currentPage?: unknown }, editorOverlayStore?: unknown })';

content = content.replace(/\(window as any\)/g, windowAnyReplacement);

// Replace yjsClient as any
content = content.replace(/yjsClient as any/g, 'yjsClient as unknown as { [key: string]: unknown }');

// Replace it: any
content = content.replace(/\(it: any\)/g, '(it: { id: string, [key: string]: unknown })');

fs.writeFileSync('client/src/stores/EditorOverlayStore.svelte.ts', content);
