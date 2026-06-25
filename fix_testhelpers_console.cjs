const fs = require("fs");
let content = fs.readFileSync("client/src/lib/yjs/testHelpers.ts", "utf8");
content = content.replace(/console\.log/g, "logger.info");
content = content.replace(/console\.error/g, "logger.error");
content = content.replace(/console\.warn/g, "logger.warn");
fs.writeFileSync("client/src/lib/yjs/testHelpers.ts", content);
