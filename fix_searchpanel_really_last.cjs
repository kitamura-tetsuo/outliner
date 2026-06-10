const fs = require('fs');
let content = fs.readFileSync('client/src/components/SearchPanel.svelte', 'utf-8');
content = content.replace(/\(m\.page as any\)\.text \?\? ""/g, '(m.page as unknown as { text?: string }).text ?? ""');
content = content.replace(/\(m\.item as any\)\.text \?\? ""/g, '(m.item as unknown as { text?: string }).text ?? ""');
fs.writeFileSync('client/src/components/SearchPanel.svelte', content);
