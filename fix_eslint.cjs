const fs = require("fs");

const file = "client/eslint.config.js";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
    "    // Temporary: Convert strict rules to warnings to allow CI to pass\n    // These rules were causing 3831 errors across 299 files\n    // TODO: Fix these issues incrementally and convert back to errors\n    // See issue #733 for tracking\n",
    "",
);

content = content.replace(
    /"no-restricted-globals": \[\n                "warn",/g,
    `"no-restricted-globals": [\n                "error",`,
);

fs.writeFileSync(file, content);
