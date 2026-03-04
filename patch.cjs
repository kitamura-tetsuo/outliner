const fs = require("fs");
const content = fs.readFileSync("client/src/lib/Cursor.ts", "utf8");
const fixed = content.replace(
    /<<<<<<< HEAD[\s\S]*?=======\s*(\/\/ eslint-disable-next-line @typescript-eslint\/no-explicit-any\s*if \(typeof \(store as any\)\.forceUpdate === 'function'\) \{\s*\/\/ eslint-disable-next-line @typescript-eslint\/no-explicit-any\s*)>>>>>>> 9404272 \(fix: resolve any usage in Cursor\.ts\)\s*(\(store as any\)\.forceUpdate\(\);\s*\})/m,
    "$1$2",
);
fs.writeFileSync("client/src/lib/Cursor.ts", fixed);
