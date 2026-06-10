const fs = require('fs');

let content = fs.readFileSync('client/src/routes/+layout.svelte', 'utf-8');

// Replace (window as any)
content = content.replace(/\(window as any\)/g, '(window as Window & typeof globalThis & { __E2E__?: boolean, __E2E_LAYOUT_MOUNTED__?: boolean, __E2E_DROP_PATCHED__?: boolean, __E2E_ATTEMPTED_DROP__?: boolean, __E2E_DROP_HANDLERS__?: ((this: unknown, e: Event) => void)[], __E2E_LAST_FILES__?: File[], __E2E_DT_ADD_PATCHED__?: boolean, __E2E_DT_ITEMS_GETTER_PATCHED__?: boolean, __E2E_FILE_CTOR_PATCHED__?: boolean, __E2E_DT_CTOR_PATCHED__?: boolean, File?: unknown, DataTransfer?: unknown, DataTransferItemList?: unknown })');

// let userManager: any; -> let userManager: { addEventListener: (f: (e: unknown) => void) => void } | undefined;
content = content.replace(/let userManager: any;/g, 'let userManager: { addEventListener: (f: (e: unknown) => void) => void } | undefined;');
content = content.replace(/\(authResult: any\)/g, '(authResult: unknown)');

// DragEvent wrap
content = content.replace(/function\(this: any, orig: any, event: Event\): boolean/g, 'function(this: unknown, orig: (...args: unknown[]) => unknown, event: Event): boolean');
content = content.replace(/\(event as any\)\.dataTransfer/g, '(event as unknown as { dataTransfer: DataTransfer }).dataTransfer');
content = content.replace(/\(fn: any\)/g, '(fn: (context: unknown, ev: Event) => void)');

content = content.replace(/\(e: any\)/g, '(e: Event)');

content = content.replace(/const anyWin: any = window as Window.*?;\n/g, 'const anyWin = window as Window & typeof globalThis & { __E2E_LAST_FILES__?: File[], __E2E_DT_ADD_PATCHED__?: boolean, __E2E_DT_ITEMS_GETTER_PATCHED__?: boolean, __E2E_FILE_CTOR_PATCHED__?: boolean, __E2E_DT_CTOR_PATCHED__?: boolean, File?: unknown, DataTransfer?: unknown, DataTransferItemList?: unknown };\n');

content = content.replace(/const itemsProto = \(DataTransferItemList as any\)\?\.prototype;/g, 'const itemsProto = (typeof DataTransferItemList !== "undefined" ? DataTransferItemList as unknown as { prototype: { add?: (data: unknown, type?: string) => void } } : undefined)?.prototype;');
content = content.replace(/itemsProto\.add = function\(data: any, type\?: string\)/g, 'itemsProto.add = function(data: unknown, type?: string)');

content = content.replace(/const desc = Object\.getOwnPropertyDescriptor\(DataTransfer\.prototype as any, 'items'\);/g, 'const desc = Object.getOwnPropertyDescriptor(DataTransfer.prototype as unknown as { items: unknown }, "items");');
content = content.replace(/Object\.defineProperty\(DataTransfer\.prototype as any, 'items', \{/g, 'Object.defineProperty(DataTransfer.prototype as unknown as { items: unknown }, "items", {');

content = content.replace(/list\.add = function\(data: any, _type\?: string\)/g, 'list.add = function(data: unknown, _type?: string)');
content = content.replace(/\} as any;/g, '} as (...args: unknown[]) => void;');
content = content.replace(/\(list as any\)\.__e2eAddPatched = true;/g, '(list as unknown as { __e2eAddPatched: boolean }).__e2eAddPatched = true;');

content = content.replace(/construct\(target: any, args: any\[\]\)/g, 'construct(target: new (...args: unknown[]) => unknown, args: unknown[])');

content = content.replace(/const list: any = \(dt as any\)\.items;/g, 'const list = (dt as unknown as { items: { add?: (d: unknown, t?: string) => void, __e2eAddPatched?: boolean } }).items;');

content = content.replace(/\(ev: any\)/g, '(ev: Event)');
content = content.replace(/\(ev\?\.target as any\)\?\.className/g, '(ev?.target as Element | null)?.className');
content = content.replace(/\(ev\?\.target as any\)\?\.tagName/g, '(ev?.target as Element | null)?.tagName');

fs.writeFileSync('client/src/routes/+layout.svelte', content);
