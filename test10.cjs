const fs = require('fs');

// Fix ApiKeyManager
const apiKeyPath = 'client/src/components/ApiKeyManager.svelte';
let apiKeyContent = fs.readFileSync(apiKeyPath, 'utf-8');
apiKeyContent = apiKeyContent.replace(/\s*\{\/if\}\n\s*$/g, '\n');
fs.writeFileSync(apiKeyPath, apiKeyContent, 'utf-8');

// Fix SearchPanel
const searchPanelPath = 'client/src/components/SearchPanel.svelte';
let searchPanelContent = fs.readFileSync(searchPanelPath, 'utf-8');
searchPanelContent = searchPanelContent.replace(/message=\{renameMessage\(pendingRename\?\.pages \|\| 0\)\}/, 'message={renameMessage(pendingRename?.pages || [])}');
fs.writeFileSync(searchPanelPath, searchPanelContent, 'utf-8');

// Fix ConfirmDialog.test.ts
const confirmDialogTestPath = 'client/src/components/ConfirmDialog.test.ts';
let confirmDialogTestContent = fs.readFileSync(confirmDialogTestPath, 'utf-8');
confirmDialogTestContent = confirmDialogTestContent.replace(/component\.isOpen/g, '(component as any).isOpen');
fs.writeFileSync(confirmDialogTestPath, confirmDialogTestContent, 'utf-8');
