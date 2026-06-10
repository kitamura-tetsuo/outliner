const fs = require('fs');
let content = fs.readFileSync('client/src/routes/+layout.svelte', 'utf-8');
content = content.replace(/const anyWin: any = window as/g, 'const anyWin = window as');
content = content.replace(/window as any;/g, 'window as Window & typeof globalThis & { __E2E_LAST_FILES__?: File[], __E2E_DT_ADD_PATCHED__?: boolean, __E2E_DT_ITEMS_GETTER_PATCHED__?: boolean, __E2E_FILE_CTOR_PATCHED__?: boolean, __E2E_DT_CTOR_PATCHED__?: boolean, File?: unknown, DataTransfer?: unknown, DataTransferItemList?: unknown };');
fs.writeFileSync('client/src/routes/+layout.svelte', content);
