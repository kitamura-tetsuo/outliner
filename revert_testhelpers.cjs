const fs = require("fs");
let content = fs.readFileSync("client/src/lib/yjs/testHelpers.ts", "utf8");
content = content.replace(/logger\.info/g, "console.log");
content = content.replace(/logger\.error/g, "console.error");
content = content.replace(/logger\.warn/g, "console.warn");

// Re-add logger import but we don't actually need it now if we revert all.
// Let's completely revert testHelpers.ts to master state or just replace logger.info with console.log.
// The task says "Avoid structure logger inside browser context in testHelpers".

// However, my previous change might have missed some block inside `page.evaluate()`! Wait, grep showed NO `logger.info` inside evaluate.
// Why did we get "ReferenceError: logger is not defined at eval ..."?
