const fs = require('fs');

let content = fs.readFileSync('client/src/components/OutlinerTree.svelte', 'utf-8');

// 1. Fix SvelteSet import and usage
if (!content.includes('import { SvelteMap, SvelteSet }')) {
    content = content.replace('import { SvelteMap } from "svelte/reactivity";', 'import { SvelteMap, SvelteSet } from "svelte/reactivity";');
}

// Replace new Set() with new SvelteSet()
content = content.replace(/changedKeys: new Set<string>\(\)/g, 'changedKeys: new SvelteSet<string>()');
content = content.replace(/const changedKeys = new Set<string>\(\);/g, 'const changedKeys = new SvelteSet<string>();');
content = content.replace(/changedKeys: new Set\(\)/g, 'changedKeys: new SvelteSet()');

// 2. Fix 'handler as any' eslint error
content = content.replace(/ymap\.observeDeep\(handler as any\);/g, "ymap.observeDeep(handler as unknown as (events: import('yjs').YEvent<any>[], transaction: import('yjs').Transaction) => void);");
content = content.replace(/ymap\.unobserveDeep\(handler as any\);/g, "ymap.unobserveDeep(handler as unknown as (events: import('yjs').YEvent<any>[], transaction: import('yjs').Transaction) => void);");

fs.writeFileSync('client/src/components/OutlinerTree.svelte', content);
console.log("Fixed eslint errors in OutlinerTree.svelte");
