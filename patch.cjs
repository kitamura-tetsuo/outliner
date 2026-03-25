const fs = require('fs');
const content = fs.readFileSync('client/src/components/PageListItem.svelte', 'utf-8');
const newContent = content.replace(
`        try {
            if (item.items) {
                let i = 0;
                for (const child of item.items) {
                    if (i++ > 10) break;
                    if (child) traverse(child, currentDepth + 1);
                    if (lines.length >= maxLines && image) return;
                    if (nodeCount >= maxNodes) return;
                }
            }
        } catch (e) {
            console.warn("Failed to iterate children", e);
        }
    }

    try {
        if (pageItem.items) {
            let i = 0;
            for (const child of pageItem.items) {
                if (i++ > 20) break;
                if (child) traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        console.warn("Failed to iterate root children", e);
    }`,
`        try {
            if (item.items) {
                const len = item.items.length;
                for (let i = 0; i < len; i++) {
                    if (i > 10) break;
                    const child = item.items.at(i);
                    if (child) traverse(child, currentDepth + 1);
                    if (lines.length >= maxLines && image) return;
                    if (nodeCount >= maxNodes) return;
                }
            }
        } catch (e) {
            console.warn("Failed to iterate children", e);
        }
    }

    try {
        if (pageItem.items) {
            const len = pageItem.items.length;
            for (let i = 0; i < len; i++) {
                if (i > 20) break;
                const child = pageItem.items.at(i);
                if (child) traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        console.warn("Failed to iterate root children", e);
    }`);
fs.writeFileSync('client/src/components/PageListItem.svelte', newContent);
