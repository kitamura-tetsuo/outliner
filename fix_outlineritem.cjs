const fs = require("fs");

let content = fs.readFileSync("client/src/components/OutlinerItem.svelte", "utf-8");

// The file has ~143 'any' occurrences.
// Most of them are related to window.__E2E__ and DragEvent patching.

content = content.replace(
    /\(window as any\)/g,
    "(window as Window & typeof globalThis & { __E2E__?: boolean, __E2E_ATTEMPTED_DROP__?: boolean, generalStore?: any, __E2E_LAST_FILES__?: File[], DataTransferItemList?: any, __E2E_DT_ADD_PATCHED__?: boolean, __E2E_DT_ITEMS_GETTER_PATCHED__?: boolean, __E2E_FILE_CTOR_PATCHED__?: boolean, __E2E_DT_CTOR_PATCHED__?: boolean, __E2E_LAST_DROP_EVENT__?: Event, editorStore?: any, File?: any, DataTransfer?: any })",
);

// (item as any)
content = content.replace(/\(item as any\)/g, "(item as unknown as { [key: string]: unknown })");

// (items as any)
content = content.replace(/\(items as any\)/g, "(items as unknown as { [key: string]: unknown })");

// (event as any)
content = content.replace(
    /\(event as any\)/g,
    "(event as unknown as { dataTransfer?: DataTransfer, target?: HTMLElement })",
);

// (e as any)
content = content.replace(/\(e as any\)/g, "(e as unknown as { dataTransfer?: DataTransfer, target?: HTMLElement })");

// data as any
content = content.replace(/data: any/g, "data: unknown");

// fn: any
content = content.replace(/fn: any/g, "fn: (...args: unknown[]) => void");

// args: any\[\]
content = content.replace(/args: any\[\]/g, "args: unknown[]");

// this: any
content = content.replace(/this: any/g, "this: unknown");

// orig: any
content = content.replace(/orig: any/g, "orig: (...args: unknown[]) => unknown");

// construct(target: any
content = content.replace(/construct\(target: any/g, "construct(target: new (...args: unknown[]) => unknown");

// function getPagesToSearch(): any[]
content = content.replace(/function getPagesToSearch\(\): any\[\]/g, "function getPagesToSearch(): Item[]");

// arr: any[]
content = content.replace(/arr: any\[\]/g, "arr: Item[]");

fs.writeFileSync("client/src/components/OutlinerItem.svelte", content);
