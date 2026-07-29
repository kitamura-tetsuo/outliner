const fs = require("fs");

let content = fs.readFileSync("client/src/components/SearchPanel.svelte", "utf-8");
content = content.replace(
    /\{#if showRenameConfirm && pendingRename\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?<\/ConfirmDialog>)\s*\{\/if\}/,
    "$1",
);
content = content.replace(
    /\{#if showReplaceConfirm\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?<\/ConfirmDialog>)\s*\{\/if\}/,
    "$1",
);
fs.writeFileSync("client/src/components/SearchPanel.svelte", content, "utf-8");

let apikey = fs.readFileSync("client/src/components/ApiKeyManager.svelte", "utf-8");
apikey = apikey.replace(
    /\{#if showRevokeConfirm\}\s*([\s\S]*?<ConfirmDialog[\s\S]*?<\/ConfirmDialog>)\s*\{\/if\}/,
    "$1",
);
fs.writeFileSync("client/src/components/ApiKeyManager.svelte", apikey, "utf-8");
