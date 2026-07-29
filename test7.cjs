const fs = require('fs');

const filePaths = [
    'client/src/components/OutlinerTree.svelte',
    'client/src/components/OutlinerItem.svelte',
    'client/src/components/SearchPanel.svelte',
    'client/src/components/ApiKeyManager.svelte'
];

filePaths.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Using simple replacement for specific known structures to remove {#if ...} block wrapping around <ConfirmDialog>

    // 1. ApiKeyManager.svelte
    content = content.replace(/\{#if showRevokeConfirm\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?<\/ConfirmDialog>)\s*\{\/if\}/, '$1');

    // 2. OutlinerItem.svelte
    content = content.replace(/\{#if showDeleteConfirm\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?\/>)\s*\{\/if\}/, '$1');

    // 3. OutlinerTree.svelte
    content = content.replace(/\{#if showDeleteConfirm\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?\/>)\s*\{\/if\}/, '$1');

    // 4. SearchPanel.svelte
    content = content.replace(/\{#if showRenameConfirm && pendingRename\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?<\/ConfirmDialog>)\s*\{\/if\}/, '$1');
    content = content.replace(/\{#if showReplaceConfirm\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?<\/ConfirmDialog>)\s*\{\/if\}/, '$1');

    fs.writeFileSync(filePath, content, 'utf-8');
});
