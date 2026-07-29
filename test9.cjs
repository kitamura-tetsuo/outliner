const fs = require("fs");

const searchPanelPath = "client/src/components/SearchPanel.svelte";
let searchPanelContent = fs.readFileSync(searchPanelPath, "utf-8");
searchPanelContent = searchPanelContent.replace(
    /\{#if showRenameConfirm && pendingRename\}\s*<ConfirmDialog\n\s*bind:isOpen=\{showRenameConfirm\}\n\s*title="Rename pages\?"\n\s*message=\{renameMessage\(pendingRename.pages\)\}\n\s*confirmText="Rename and Replace"\n\s*isDestructive=\{true\}\n\s*onConfirm=\{[^{}]*\{[^}]*\}[^{}]*\}\n\s*onCancel=\{[^{}]*\{[^}]*\}[^{}]*\}\n\s*\/>\n\s*\{\/if\}/,
    '<ConfirmDialog\n        bind:isOpen={showRenameConfirm}\n        title="Rename pages?"\n        message={renameMessage(pendingRename?.pages || 0)}\n        confirmText="Rename and Replace"\n        isDestructive={true}\n        onConfirm={() => {\n            const pending = pendingRename;\n            showRenameConfirm = false;\n            pendingRename = undefined;\n            pending?.run();\n        }}\n        onCancel={() => {\n            showRenameConfirm = false;\n            pendingRename = undefined;\n        }}\n    />',
);

// Try with simpler replace strings
searchPanelContent = searchPanelContent.replace(
    /\{#if showRenameConfirm && pendingRename\}\n\s*<ConfirmDialog/g,
    "<ConfirmDialog",
);
searchPanelContent = searchPanelContent.replace(/\s*\}\}\n\s*\/>\n\{\/if\}/g, "    }}\n    />");

searchPanelContent = searchPanelContent.replace(/\{#if showReplaceAllConfirm\}\n\s*<ConfirmDialog/g, "<ConfirmDialog");
searchPanelContent = searchPanelContent.replace(
    /\s*onCancel=\{([^}]+)\}\n\s*\/>\n\{\/if\}/g,
    "    onCancel={$1}\n    />",
);

fs.writeFileSync(searchPanelPath, searchPanelContent, "utf-8");

const apiKeyPath = "client/src/components/ApiKeyManager.svelte";
let apiKeyContent = fs.readFileSync(apiKeyPath, "utf-8");
apiKeyContent = apiKeyContent.replace(/\{#if showRevokeConfirm\}\n\s*<ConfirmDialog/g, "<ConfirmDialog");
apiKeyContent = apiKeyContent.replace(/\s*onCancel=\{([^}]+)\}\n\s*\/>\n\{\/if\}/g, "    onCancel={$1}\n    />");

fs.writeFileSync(apiKeyPath, apiKeyContent, "utf-8");
