const fs = require("fs");

const filePaths = [
    "client/src/components/OutlinerTree.svelte",
    "client/src/components/OutlinerItem.svelte",
    "client/src/components/SearchPanel.svelte",
    "client/src/components/ApiKeyManager.svelte",
];

filePaths.forEach(filePath => {
    let content = fs.readFileSync(filePath, "utf-8");

    // Check if ConfirmDialog is wrapped in {#if showX}
    const hasIfConfirmDialog = /\{#if[^{]*\}\s*<ConfirmDialog/.test(content)
        || /\{#if[^{]*\}\s*<svelte:component[^>]*this=\{ConfirmDialog\}/.test(content);
    console.log(filePath, hasIfConfirmDialog);
});
