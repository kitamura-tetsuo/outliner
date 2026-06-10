const fs = require('fs');

let content = fs.readFileSync('client/src/components/SearchPanel.svelte', 'utf-8');

// The file has ~75 'any' occurrences, mostly related to 'items' iteration and property access.
// We can use sed or regex replacement to fix these.

// Replace `(window as any).__SEARCH_PANEL_VISIBLE__`
content = content.replace(/\(window as any\)\.__SEARCH_PANEL_VISIBLE__/g, '(window as Window & typeof globalThis & { __SEARCH_PANEL_VISIBLE__?: boolean }).__SEARCH_PANEL_VISIBLE__');

// Replace `(project as any)?.items` with `project?.items`
content = content.replace(/\(project as any\)\?\.items/g, 'project?.items');

// Replace `getPagesToSearch(): any[]` with `getPagesToSearch(): Item[]`
content = content.replace(/function getPagesToSearch\(\): any\[\] \{/g, 'function getPagesToSearch(): Item[] {');
content = content.replace(/const arr: any\[\] = \[\];/g, 'const arr: Item[] = [];');

// Replace `items as any` iteration
content = content.replace(/for \(const p of items as any\)/g, 'for (const p of items as unknown as Iterable<Item>)');
content = content.replace(/typeof \(items as any\)\.length === "number"/g, 'items && typeof (items as unknown as { length: number }).length === "number"');
content = content.replace(/const len = \(items as any\)\.length;/g, 'const len = (items as unknown as { length: number }).length;');
content = content.replace(/const v = \(items as any\)\.at\s*\?\s*\(items as any\)\.at\(i\)\s*:\s*\(items as any\)\[i\];/g, 'const v = (items as unknown as { at?: (i: number) => Item })?.at ? (items as unknown as { at: (i: number) => Item }).at(i) : (items as unknown as Item[])[i];');

content = content.replace(/const gs = \(window as any\)\.generalStore;/g, 'const gs = (window as Window & typeof globalThis & { generalStore?: any }).generalStore;');
content = content.replace(/for \(const p of pages as any\)/g, 'for (const p of pages as unknown as Iterable<Item>)');
content = content.replace(/typeof \(pages as any\)\.length === "number"/g, 'pages && typeof (pages as unknown as { length: number }).length === "number"');
content = content.replace(/const len = \(pages as any\)\.length;/g, 'const len = (pages as unknown as { length: number }).length;');
content = content.replace(/const v = \(pages as any\)\.at\s*\?\s*\(pages as any\)\.at\(i\)\s*:\s*\(pages as any\)\[i\];/g, 'const v = (pages as unknown as { at?: (i: number) => Item })?.at ? (pages as unknown as { at: (i: number) => Item }).at(i) : (pages as unknown as Item[])[i];');

content = content.replace(/const collected: Array<PageItemMatch<Item>> = \[\] as any;/g, 'const collected: Array<PageItemMatch<Item>> = [];');
content = content.replace(/const pageTitle = \(\(p as any\)\.text\?\.toString\?\.\(\) \?\?\s*String\(\(p as any\)\.text \?\? ""\)\) as string;/g, 'const pageTitle = (p.text?.toString?.() ?? String(p.text ?? "")) as string;');

content = content.replace(/item: p as any,/g, 'item: p,');
content = content.replace(/page: p as any,/g, 'page: p,');
content = content.replace(/} as any\);/g, '});');

content = content.replace(/const children: any = \(p as any\)\.items;/g, 'const children = p.items;');
content = content.replace(/for \(const child of children as any\)/g, 'for (const child of children as unknown as Iterable<Item>)');

content = content.replace(/child as any/g, 'child');
content = content.replace(/\(child as any\)\.text \?\? ""/g, 'child.text ?? ""');

content = content.replace(/item: child as any,/g, 'item: child,');
content = content.replace(/page: p as any,/g, 'page: p,');

content = content.replace(/len = \(children as any\)\?\.length \?\? 0;/g, 'len = (children as unknown as { length?: number })?.length ?? 0;');
content = content.replace(/const child = \(children as any\)\.at\s*\?\s*\(children as any\)\.at\(i\)\s*:\s*\(children as any\)\[i\];/g, 'const child = (children as unknown as { at?: (i: number) => Item })?.at ? (children as unknown as { at: (i: number) => Item }).at(i) : (children as unknown as Item[])[i];');

content = content.replace(/matches = collected as any;/g, 'matches = collected;');

content = content.replace(/\(window as any\)\.__E2E_LAST_MATCH_COUNT__/g, '(window as Window & typeof globalThis & { __E2E_LAST_MATCH_COUNT__?: number }).__E2E_LAST_MATCH_COUNT__');

content = content.replace(/\(m\.page as any\)\?\.text\?\.toString\?\.\(\) \?\?\s*String\(\(m\.page as any\)\?\.text \?\? ""\)/g, 'm.page?.text?.toString?.() ?? String(m.page?.text ?? "")');
content = content.replace(/\(m\.item as any\)\?\.text\?\.toString\?\.\(\) \?\?\s*String\(\(m\.item as any\)\?\.text \?\? ""\)/g, 'm.item?.text?.toString?.() ?? String(m.item?.text ?? "")');

content = content.replace(/pageItem as any,/g, 'pageItem,');
content = content.replace(/matches = localMatches as any;/g, 'matches = localMatches;');

content = content.replace(/const fallback: Array<PageItemMatch<Item>> = \[\] as any;/g, 'const fallback: Array<PageItemMatch<Item>> = [];');
content = content.replace(/const text = \(\(p as any\)\.text\?\.toString\?\.\(\) \?\?\s*String\(\(p as any\)\.text \?\? ""\)\) as string;/g, 'const text = (p.text?.toString?.() ?? String(p.text ?? "")) as string;');

content = content.replace(/matches = fallback as any;/g, 'matches = fallback;');

content = content.replace(/highlight\(matches as any, options\);/g, 'highlight(matches, options);');
content = content.replace(/replaceFirst\(p as any, searchQuery, replaceText, options\)/g, 'replaceFirst(p, searchQuery, replaceText, options)');
content = content.replace(/p as any,/g, 'p,');

content = content.replace(/if \(newText !== text && \(p as any\)\.updateText\)\s*\(p as any\)\.updateText\(newText\);/g, 'if (newText !== text && "updateText" in p && typeof p.updateText === "function") {\n                        p.updateText(newText);\n                    }');

content = content.replace(/\(\(match\.page as any\)\.text\?\.toString\?\.\(\) \?\?\s*String\(\(match\.page as any\)\.text \?\? ""\)\) as string/g, '(match.page.text?.toString?.() ?? String(match.page.text ?? "")) as string');

content = content.replace(/>\{\(m\.page as any\)\.text\?\.toString\?\.\(\) \?\?\s*\(m\.page as any\)\.text \?\? "",\s*options\)\}/g, '>{m.page.text?.toString?.() ?? m.page.text ?? "", options}');
content = content.replace(/>\{\(m\.item as any\)\.text\?\.toString\?\.\(\) \?\?\s*\(m\.item as any\)\.text \?\? "",\s*options\)\}/g, '>{m.item.text?.toString?.() ?? m.item.text ?? "", options}');


fs.writeFileSync('client/src/components/SearchPanel.svelte', content);
