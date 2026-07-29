const fs = require("fs");

let content = fs.readFileSync("client/src/components/ConfirmDialog.svelte", "utf-8");

// Remove isConfirming entirely since oncancel covers it natively.
content = content.replace(
    /let isConfirming = false;\n\nfunction handleConfirm\(\) \{\n    isConfirming = true;/g,
    "function handleConfirm() {",
);
content = content.replace(
    /function handleCancel\(_e\?: Event\) \{\n    if \(isConfirming\) return;/g,
    "function handleCancel(_e?: Event) {",
);

fs.writeFileSync("client/src/components/ConfirmDialog.svelte", content, "utf-8");
