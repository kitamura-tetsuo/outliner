import { readFileSync, writeFileSync } from "fs";

const filepath = "client/src/lib/cursor/CursorNavigation.ts";
let content = readFileSync(filepath, "utf8");

content = content.replace(
    /export function collectAllItemIds\(node: AppItem, ids: string\[\]\): string\[\] \{\n    if \(node\.id\) \{\n        ids\.push\(node\.id\);\n    \}\n\n    \/\/ Check if node has items that are iterable\n    if \(node\.items && typeof \(node\.items as \{ length\?: number; \}\)\.length === "number"\) \{\n        const items = node\.items as \{ length: number; at: \(i: number\) => AppItem \| undefined; \};\n        for \(let i = 0; i < items\.length; i\+\+\) \{\n            const child = items\.at\(i\);\n            if \(child\) \{\n                collectAllItemIds\(child, ids\);\n            \}\n        \}\n    \}\n\n    return ids;\n\}/g,
    `import { iterateItemsOrdered } from "../../../../shared/src/utils/itemTraversal";\n\nexport function collectAllItemIds(node: AppItem, ids: string[]): string[] {\n    if (node.id) {\n        ids.push(node.id);\n    }\n\n    if (node.items) {\n        for (const child of iterateItemsOrdered(node.items) as Iterable<AppItem>) {\n            collectAllItemIds(child, ids);\n        }\n    }\n\n    return ids;\n}`,
);

writeFileSync(filepath, content, "utf8");
