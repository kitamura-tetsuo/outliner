const fs = require('fs');

let content = fs.readFileSync('client/src/components/OutlinerItem.svelte', 'utf-8');

// Replace (window as any) with proper typed casting
content = content.replace(/\(window as any\)/g, '(window as Window & typeof globalThis & { __E2E__?: boolean, __E2E_DEBUG__?: boolean, __E2E_ATTEMPTED_DROP__?: boolean, generalStore?: unknown, __E2E_LAST_FILES__?: File[], DataTransferItemList?: unknown, __E2E_DT_ADD_PATCHED__?: boolean, __E2E_DT_ITEMS_GETTER_PATCHED__?: boolean, __E2E_FILE_CTOR_PATCHED__?: boolean, __E2E_DT_CTOR_PATCHED__?: boolean, __E2E_LAST_DROP_EVENT__?: Event, editorStore?: unknown, aliasPickerStore?: unknown })');

// Type overrides
content = content.replace(/\(logger as any\)/g, '(logger as unknown as { debug: (...args: unknown[]) => void })');
content = content.replace(/\(compTypeValue as any\)/g, '(compTypeValue as unknown as { current: unknown })');

content = content.replace(/const W: any = window as Window/g, 'const W = window as Window');
content = content.replace(/const W:any = window as Window/g, 'const W = window as Window');

// aliasPickerStore
content = content.replace(/const ap: any = W\.aliasPickerStore;/g, 'const ap = (W as Window & typeof globalThis & { aliasPickerStore?: unknown }).aliasPickerStore as { insertAlias?: (id: string, text: string) => void };');
content = content.replace(/const ap:any = \(window as Window.*?\)\.aliasPickerStore;/g, 'const ap = (window as Window & typeof globalThis & { aliasPickerStore?: unknown }).aliasPickerStore as { insertAlias?: (id: string, text: string) => void };');

// origGetAttr
content = content.replace(/origGetAttr\.call\(this, name\) as any;/g, 'origGetAttr.call(this, name) as string | null;');
content = content.replace(/\} as any;/g, '} as (...args: unknown[]) => unknown;');

content = content.replace(/const gs: any = generalStore as any;/g, 'const gs = generalStore as unknown as { currentPage?: { items?: unknown } };');
content = content.replace(/const cp: any = gs\?\.currentPage;/g, 'const cp = gs?.currentPage;');
content = content.replace(/const items: any = cp\?\.items as any;/g, 'const items = cp?.items as unknown as { iterateUnordered?: () => Iterable<unknown> };');

content = content.replace(/\(generalStore as any\)\.openCommentItemId/g, '(generalStore as unknown as { openCommentItemId: string | null }).openCommentItemId');
content = content.replace(/\(generalStore as any\)\.openCommentItemIndex/g, '(generalStore as unknown as { openCommentItemIndex: number | null }).openCommentItemIndex');

content = content.replace(/function normalizeCommentCount\(arr: any\): number/g, 'function normalizeCommentCount(arr: unknown): number');
content = content.replace(/function ensureCommentsArray\(\): any/g, 'function ensureCommentsArray(): unknown[]');
content = content.replace(/const it = item as any;/g, 'const it = item as unknown as { comments: unknown[] };');

content = content.replace(/function applyCommentCount\(arrOrCount: any\)/g, 'function applyCommentCount(arrOrCount: unknown)');

content = content.replace(/\(event as CustomEvent<any>\)\?\.detail/g, '(event as CustomEvent<unknown>)?.detail');

content = content.replace(/const anyItem: any = item as any;/g, 'const anyItem = item as unknown as { tree?: { getNodeValueFromKey?: (k: string) => unknown }, key: string };');
content = content.replace(/const ymap: any = anyItem\?\.tree\?\.getNodeValueFromKey\?\.([^;]+);/g, 'const ymap = anyItem?.tree?.getNodeValueFromKey?.(anyItem.key) as { observe?: (f: (e: unknown) => void) => void, unobserve?: (f: (e: unknown) => void) => void } | undefined;');
content = content.replace(/const obs = \(e\?: any\) => \{/g, 'const obs = (e?: unknown) => {');

content = content.replace(/const ap: any = aliasPickerStore as any;/g, 'const ap = aliasPickerStore as unknown as { openAliasSearch: (...args: unknown[]) => void };');
content = content.replace(/void \(aliasPickerStore as any\)\?\.tick;/g, 'void (aliasPickerStore as unknown as { tick?: unknown })?.tick;');

content = content.replace(/const lastItemId = \(aliasPickerStore as any\)\?\.lastConfirmedItemId;/g, 'const lastItemId = (aliasPickerStore as unknown as { lastConfirmedItemId?: string })?.lastConfirmedItemId;');
content = content.replace(/const lastTargetId = \(aliasPickerStore as any\)\?\.lastConfirmedTargetId;/g, 'const lastTargetId = (aliasPickerStore as unknown as { lastConfirmedTargetId?: string })?.lastConfirmedTargetId;');
content = content.replace(/const lastAt = \(aliasPickerStore as any\)\?\.lastConfirmedAt as number \| null;/g, 'const lastAt = (aliasPickerStore as unknown as { lastConfirmedAt?: number | null })?.lastConfirmedAt;');

content = content.replace(/const targetEl: any = \(ev\?\.target as any\)\?\.closest\?\.\('\.outliner-item'\) \|\| null;/g, 'const targetEl = (ev?.target as Element | null)?.closest?.(".outliner-item") || null;');

content = content.replace(/try \{ \(model\.original as any\)\.attachments\.push\(\[url\]\); \} catch \{\}/g, 'try { (model.original as unknown as { attachments: string[][] }).attachments.push([url]); } catch {}');
content = content.replace(/const w: any = \(typeof window !== 'undefined'\) \? \(window as Window.*?\)/g, 'const w = (typeof window !== "undefined") ? (window as Window & typeof globalThis & { generalStore?: any })');
content = content.replace(/const curPage: any = w\?\.generalStore\?\.currentPage;/g, 'const curPage = w?.generalStore?.currentPage as { items?: { at?: (i: number) => any } } | undefined;');
content = content.replace(/try \{ \(cand as any\)\.attachments\.push\(\[url\]\); \} catch \{\}/g, 'try { (cand as unknown as { attachments: string[][] }).attachments.push([url]); } catch {}');

content = content.replace(/const setMapField = \(it: any, key: string, value: any\) => \{/g, 'const setMapField = (it: unknown, key: string, value: unknown) => {');
content = content.replace(/if \("componentType" in \(item as any\)\) \{/g, 'if (item && typeof item === "object" && "componentType" in item) {');

fs.writeFileSync('client/src/components/OutlinerItem.svelte', content);
