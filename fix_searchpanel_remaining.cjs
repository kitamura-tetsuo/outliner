const fs = require("fs");

let content = fs.readFileSync("client/src/components/SearchPanel.svelte", "utf-8");
content = content.replace(/getPagesToSearch\(\): any\[\]/g, "getPagesToSearch(): Item[]");
content = content.replace(/const arr: any\[\]/g, "const arr: Item[]");
content = content.replace(/for \(const p of items as any\)/g, "for (const p of items as unknown as Iterable<Item>)");
content = content.replace(/typeof \(items as any\)/g, "typeof (items as unknown as { length: number })");
content = content.replace(/const len = \(items as any\)/g, "const len = (items as unknown as { length: number })");
content = content.replace(/\(items as any\)\.at/g, "(items as unknown as { at?: (i: number) => Item }).at");
content = content.replace(/\(items as any\)\[i\]/g, "(items as unknown as Item[])[i]");

content = content.replace(/for \(const p of pages as any\)/g, "for (const p of pages as unknown as Iterable<Item>)");
content = content.replace(/typeof \(pages as any\)/g, "typeof (pages as unknown as { length: number })");
content = content.replace(/const len = \(pages as any\)/g, "const len = (pages as unknown as { length: number })");
content = content.replace(/\(pages as any\)\.at/g, "(pages as unknown as { at?: (i: number) => Item }).at");
content = content.replace(/\(pages as any\)\[i\]/g, "(pages as unknown as Item[])[i]");

content = content.replace(
    /const collected: Array<PageItemMatch<Item>> = \[\] as any;/g,
    "const collected: Array<PageItemMatch<Item>> = [];",
);
content = content.replace(/\(p as any\)\.text/g, "(p as unknown as { text?: string }).text");
content = content.replace(/item: p as any,/g, "item: p,");
content = content.replace(/page: p as any,/g, "page: p,");
content = content.replace(/\} as any;/g, "}");

content = content.replace(/const children: any =/g, "const children =");
content = content.replace(
    /for \(const child of children as any\)/g,
    "for (const child of children as unknown as Iterable<Item>)",
);
content = content.replace(/child as any,/g, "child,");
content = content.replace(/\(child as any\)\.text/g, "(child as unknown as { text?: string }).text");
content = content.replace(/item: child as any,/g, "item: child,");
content = content.replace(/page: p as any,/g, "page: p,");
content = content.replace(/\(children as any\)\?/g, "(children as unknown as { length?: number })?");
content = content.replace(/\(children as any\)\.at/g, "(children as unknown as { at?: (i: number) => Item }).at");
content = content.replace(/\(children as any\)\[i\]/g, "(children as unknown as Item[])[i]");

content = content.replace(/matches = collected as any;/g, "matches = collected;");
content = content.replace(/\(m\.page as any\)\?\.text/g, "(m.page as unknown as { text?: string })?.text");
content = content.replace(/\(m\.item as any\)\?\.text/g, "(m.item as unknown as { text?: string })?.text");
content = content.replace(/pageItem as any,/g, "pageItem,");
content = content.replace(/matches = localMatches as any;/g, "matches = localMatches;");

content = content.replace(
    /const fallback: Array<PageItemMatch<Item>> = \[\] as any;/g,
    "const fallback: Array<PageItemMatch<Item>> = [];",
);
content = content.replace(/matches = fallback as any;/g, "matches = fallback;");
content = content.replace(/highlight\(matches as any,/g, "highlight(matches,");
content = content.replace(/replaceFirst\(p as any,/g, "replaceFirst(p,");
content = content.replace(/p as any,/g, "p,");
content = content.replace(
    /\(p as any\)\.updateText/g,
    "(p as unknown as { updateText?: (t: string) => void }).updateText",
);
content = content.replace(/\(match\.page as any\)\.text/g, "(match.page as unknown as { text?: string }).text");

fs.writeFileSync("client/src/components/SearchPanel.svelte", content);
