const fs = require("fs");

const path = "client/src/routes/[project]/[page]/schedule/+page.svelte";
let content = fs.readFileSync(path, "utf8");

content = content.replace(/store\.project as \{/g, "store.project as unknown as {");

fs.writeFileSync(path, content);
