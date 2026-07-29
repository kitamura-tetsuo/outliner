const fs = require('fs');

const filePaths = [
    'client/src/components/OutlinerTree.svelte',
    'client/src/components/OutlinerItem.svelte',
    'client/src/components/SearchPanel.svelte',
    'client/src/components/ApiKeyManager.svelte'
];

filePaths.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Check if ConfirmDialog is wrapped in {#if showX}
    const hasIfConfirmDialog = /\{#if[^{]*\}\s*<ConfirmDialog/.test(content) || /\{#if[^{]*\}\s*<svelte:component[^>]*this=\{ConfirmDialog\}/.test(content);

    // If it's conditionally rendered, let's remove the condition
    if (content.includes('{#if showConfirmDelete}')) {
        content = content.replace(/\{#if showConfirmDelete\}\s*<ConfirmDialog([\s\S]*?)<\/ConfirmDialog>\s*\{\/if\}/g, '<ConfirmDialog$1</ConfirmDialog>');
        // Try other possible matching patterns
        content = content.replace(/\{#if showConfirmDelete\}\n\s*<ConfirmDialog([\s\S]*?)\/>\n\s*\{\/if\}/g, '<ConfirmDialog$1/>');
    }

    if (content.includes('{#if showConfirmDialog}')) {
         content = content.replace(/\{#if showConfirmDialog\}\s*<ConfirmDialog([\s\S]*?)<\/ConfirmDialog>\s*\{\/if\}/g, '<ConfirmDialog$1</ConfirmDialog>');
         content = content.replace(/\{#if showConfirmDialog\}\n\s*<ConfirmDialog([\s\S]*?)\/>\n\s*\{\/if\}/g, '<ConfirmDialog$1/>');
    }

    if (content.includes('{#if showReplaceConfirm}')) {
         content = content.replace(/\{#if showReplaceConfirm\}\n\s*<ConfirmDialog([\s\S]*?)\/>\n\s*\{\/if\}/g, '<ConfirmDialog$1/>');
    }

    if (content.includes('{#if showRenameConfirm}')) {
         content = content.replace(/\{#if showRenameConfirm\}\n\s*<ConfirmDialog([\s\S]*?)\/>\n\s*\{\/if\}/g, '<ConfirmDialog$1/>');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
});

console.log("Done");
