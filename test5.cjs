const fs = require('fs');

const filePaths = [
    'client/src/components/OutlinerTree.svelte',
    'client/src/components/OutlinerItem.svelte',
    'client/src/components/SearchPanel.svelte',
    'client/src/components/ApiKeyManager.svelte'
];

filePaths.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Attempting regex replacement to unwrap {#if ...} <ConfirmDialog ... /> {/if}
    // We should be careful to capture the correct block.

    // OutlinerTree
    if (filePath.includes('OutlinerTree')) {
        content = content.replace(/\{#if showConfirmDelete\}\n\s*(<ConfirmDialog[\s\S]*?\/>)\n\s*\{\/if\}/, '$1');
    }

    // OutlinerItem
    if (filePath.includes('OutlinerItem')) {
        content = content.replace(/\{#if showConfirmDelete\}\n\s*(<ConfirmDialog[\s\S]*?\/>)\n\s*\{\/if\}/, '$1');
    }

    // SearchPanel
    if (filePath.includes('SearchPanel')) {
        content = content.replace(/\{#if showReplaceConfirm\}\n\s*(<ConfirmDialog[\s\S]*?\/>)\n\s*\{\/if\}/, '$1');
        content = content.replace(/\{#if showRenameConfirm\}\n\s*(<ConfirmDialog[\s\S]*?\/>)\n\s*\{\/if\}/, '$1');
    }

    // ApiKeyManager
    if (filePath.includes('ApiKeyManager')) {
        content = content.replace(/\{#if showConfirmDialog\}\n\s*(<ConfirmDialog[\s\S]*?\/>)\n\s*\{\/if\}/, '$1');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
});

console.log("Done replacing");
