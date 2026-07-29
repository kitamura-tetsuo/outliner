const fs = require("fs");
let content = fs.readFileSync("client/src/components/ConfirmDialog.svelte", "utf-8");
content = content.replace(
    "if (isOpen) {",
    "if (!dialogElement.showModal || !dialogElement.close) return;\n        if (isOpen) {",
);
fs.writeFileSync("client/src/components/ConfirmDialog.svelte", content, "utf-8");
