const fs = require('fs');
let content = fs.readFileSync('client/src/lib/yjs/testHelpers.ts', 'utf8');
const lines = content.split('\n');

// Specific lines that need to be reverted back to console.* because they run in the browser
const linesToFix = [
    215, // logger.info(`[${pv}] reconnected, isSynced=${provider.isSynced}`);
    217, // logger.error(`[${pv}] reconnect failed:`, e);
    262, // provider.on("status", (e: { status: string; }) => logger.info(`[${providerVar}] status`, e.status));
    265, // (data: { state: boolean; }) => logger.info(`[${providerVar}] synced`, data.state),
    267, // logger.info(
    312, // logger.error(`setupUpdateTracking: ${docVar} not found`);
    513, // logger.info("page1: yjsClient not found");
    518, // logger.info("page1: project not found");
    524, // logger.info(`page1: Yjs client initialized, pageCount=${pageCount}`);
    585, // logger.info("page2: yjsClient not found");
    590, // logger.info("page2: project or items not found");
    595, // logger.info("page2: appStore not found");
    598, // logger.info("page2: Yjs client and appStore initialized");
];

for (const lineNum of linesToFix) {
    const idx = lineNum - 1;
    if (lines[idx]) {
        lines[idx] = lines[idx].replace(/logger\.info/g, 'console.log');
        lines[idx] = lines[idx].replace(/logger\.error/g, 'console.error');
        lines[idx] = lines[idx].replace(/logger\.warn/g, 'console.warn');
    }
}

fs.writeFileSync('client/src/lib/yjs/testHelpers.ts', lines.join('\n'));
