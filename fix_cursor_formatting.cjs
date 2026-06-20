const fs = require("fs");

const path = "client/src/lib/cursor/CursorFormatting.ts";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
    /const item = searchItem\(generalStore\.currentPage\!, itemId\);/g,
    'const item = searchItem(generalStore.currentPage! as unknown as import("../../schema/yjs-schema").Item, itemId);',
);

fs.writeFileSync(path, content);
