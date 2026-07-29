const fs = require('fs');

let content = fs.readFileSync('client/src/components/ConfirmDialog.svelte', 'utf-8');
content = content.replace(
    'if (!dialogElement.showModal || !dialogElement.close) return;',
    'if (!dialogElement || !dialogElement.showModal || !dialogElement.close) return;'
);
fs.writeFileSync('client/src/components/ConfirmDialog.svelte', content, 'utf-8');
