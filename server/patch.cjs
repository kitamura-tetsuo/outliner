const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, 'src/demo-api.ts');
let content = fs.readFileSync(targetPath, 'utf8');

const replacement = `
                        for (const key of treeMap.keys()) {
                            if (key === "root" || key === "deleted") continue;
                            const nodeMap = treeMap.get(key) as Y.Map<unknown> | undefined;

                            let isRootChild = false;

                            if (nodeMap && nodeMap.get("_parentHistory") instanceof Y.Map) {
                                isRootChild = (nodeMap.get("_parentHistory") as Y.Map<unknown>).has("root");
                            } else if (nodeMap && nodeMap.get("parentHistory")) {
                                isRootChild = true;
                            } else if (nodeMap && nodeMap.has("value")) {
                                isRootChild = true;
                            }

                            if (isRootChild) {
                                const valueMap = nodeMap.get("value") as Y.Map<unknown> | undefined;
                                if (valueMap && valueMap.has("text")) {
                                    const text = valueMap.get("text") as Y.Text | undefined;
                                    if (text) {
                                        existingTitles.add(text.toString().trim().toLowerCase());
                                    }
                                }
                            }
                        }
`;

content = content.replace(
    /                        for \(const key of treeMap\.keys\(\)\) \{\n                            if \(key === "root" \|\| key === "deleted"\) continue;\n                            const nodeMap = treeMap\.get\(key\) as Y\.Map<unknown> \| undefined;\n                            if \(\n                                nodeMap && nodeMap\.get\("_parentHistory"\) instanceof Y\.Map\n                                && \(nodeMap\.get\("_parentHistory"\) as Y\.Map<unknown>\)\.has\("root"\)\n                            \) \{\n                                const valueMap = nodeMap\.get\("value"\) as Y\.Map<unknown> \| undefined;\n                                if \(valueMap && valueMap\.has\("text"\)\) \{\n                                    const text = valueMap\.get\("text"\) as Y\.Text \| undefined;\n                                    if \(text\) \{\n                                        existingTitles\.add\(text\.toString\(\)\.trim\(\)\.toLowerCase\(\)\);\n                                    \}\n                                \}\n                            \}\n                        \}/,
    replacement.trim()
);

fs.writeFileSync(targetPath, content);
