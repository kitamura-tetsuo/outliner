const fs = require("fs");
let content = fs.readFileSync("client/src/components/yjstable/TableUiDefEditor.svelte", "utf-8");
content = content.replace(
    "const cfg = existing instanceof Y.Map ? existing : new Y.Map<unknown>();",
    "const cfg = (existing instanceof Y.Map ? existing : new Y.Map<unknown>()) as Y.Map<unknown>;",
);
fs.writeFileSync("client/src/components/yjstable/TableUiDefEditor.svelte", content);
