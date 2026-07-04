const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("/workspace/client/package.json", "utf8"));
pkg.scripts["coverage:cleanup"] = "node scripts/cleanup-coverage.js";
fs.writeFileSync("/workspace/client/package.json", JSON.stringify(pkg, null, 4) + "\n");
