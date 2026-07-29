const fs = require('fs');

const filePaths = [
    'client/src/components/OutlinerTree.svelte',
    'client/src/components/OutlinerItem.svelte',
    'client/src/components/SearchPanel.svelte',
    'client/src/components/ApiKeyManager.svelte'
];

filePaths.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Instead of regex, let's just do a simpler replacement or find the blocks.

    // In Svelte files, we might have nested stuff. Let's do a simple string replace for the ones we know

    if (filePath.includes('OutlinerTree.svelte')) {
        content = content.replace('{#if showConfirmDelete}\n    <ConfirmDialog\n        bind:isOpen={showConfirmDelete}\n        title="Delete Item"\n        message="Are you sure you want to delete this item? This action cannot be undone."\n        confirmText="Delete"\n        isDestructive={true}\n        onConfirm={handleConfirmDelete}\n    />\n{/if}', '<ConfirmDialog\n        bind:isOpen={showConfirmDelete}\n        title="Delete Item"\n        message="Are you sure you want to delete this item? This action cannot be undone."\n        confirmText="Delete"\n        isDestructive={true}\n        onConfirm={handleConfirmDelete}\n    />');
    }

    if (filePath.includes('OutlinerItem.svelte')) {
        content = content.replace('{#if showConfirmDelete}\n    <ConfirmDialog\n        bind:isOpen={showConfirmDelete}\n        title="Delete Item"\n        message="Are you sure you want to delete this item? This action cannot be undone."\n        confirmText="Delete"\n        isDestructive={true}\n        onConfirm={handleConfirmDelete}\n    />\n{/if}', '<ConfirmDialog\n        bind:isOpen={showConfirmDelete}\n        title="Delete Item"\n        message="Are you sure you want to delete this item? This action cannot be undone."\n        confirmText="Delete"\n        isDestructive={true}\n        onConfirm={handleConfirmDelete}\n    />');
    }

    if (filePath.includes('SearchPanel.svelte')) {
        content = content.replace('{#if showReplaceConfirm}\n        <ConfirmDialog\n            bind:isOpen={showReplaceConfirm}\n            title="Replace All"\n            message={`Are you sure you want to replace all ${replaceCount} occurrences? This action cannot be undone.`}\n            confirmText="Replace All"\n            isDestructive={true}\n            onConfirm={handleReplaceConfirm}\n        />\n    {/if}', '<ConfirmDialog\n            bind:isOpen={showReplaceConfirm}\n            title="Replace All"\n            message={`Are you sure you want to replace all ${replaceCount} occurrences? This action cannot be undone.`}\n            confirmText="Replace All"\n            isDestructive={true}\n            onConfirm={handleReplaceConfirm}\n        />');

        content = content.replace('{#if showRenameConfirm}\n        <ConfirmDialog\n            bind:isOpen={showRenameConfirm}\n            title="Rename Pages"\n            message={`Are you sure you want to rename all ${replaceCount} page references? This action cannot be undone.`}\n            confirmText="Rename All"\n            isDestructive={true}\n            onConfirm={handleRenameConfirm}\n        />\n    {/if}', '<ConfirmDialog\n            bind:isOpen={showRenameConfirm}\n            title="Rename Pages"\n            message={`Are you sure you want to rename all ${replaceCount} page references? This action cannot be undone.`}\n            confirmText="Rename All"\n            isDestructive={true}\n            onConfirm={handleRenameConfirm}\n        />');
    }

    if (filePath.includes('ApiKeyManager.svelte')) {
         content = content.replace('{#if showConfirmDialog}\n    <ConfirmDialog\n        bind:isOpen={showConfirmDialog}\n        title="Revoke API Key"\n        message={`Are you sure you want to revoke the API key "${keyToRevoke?.name}"? Any applications using this key will immediately lose access.`}\n        confirmText="Revoke Key"\n        isDestructive={true}\n        onConfirm={confirmRevoke}\n    />\n{/if}', '<ConfirmDialog\n        bind:isOpen={showConfirmDialog}\n        title="Revoke API Key"\n        message={`Are you sure you want to revoke the API key "${keyToRevoke?.name}"? Any applications using this key will immediately lose access.`}\n        confirmText="Revoke Key"\n        isDestructive={true}\n        onConfirm={confirmRevoke}\n    />');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
});
