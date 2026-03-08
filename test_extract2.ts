import { Project } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
console.log("i1 text:", i1.text);
const i2 = page.items.addNode("author");
i2.updateText("Line 2");
console.log("i2 text:", i2.text);

// replicate extractPagePreview
function extractPagePreview(pageItem: any, maxLines: number = 3, maxDepth: number = 3) {
    const lines: string[] = [];
    let image: string | null = null;
    let nodeCount = 0;
    const maxNodes = 50;

    function traverse(item: any, currentDepth: number) {
        if (nodeCount >= maxNodes) return;
        nodeCount++;

        let text = "";
        try {
            text = item.text ? item.text.trim() : "";
        } catch (e) {
            console.warn("Failed to extract text", e);
        }

        if (text && lines.length < maxLines && item.id !== pageItem.id) {
            lines.push(text);
        }

        if (currentDepth >= maxDepth) return;

        try {
            if (item.items) {
                let i = 0;
                const children = item.items;
                const len = children.length;
                for (let k = 0; k < len; k++) {
                    if (i++ > 10) break;
                    const child = children.at(k);
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
            const rootChildren = pageItem.items;
            const len = rootChildren.length;
            for (let k = 0; k < len; k++) {
                if (i++ > 20) break;
                const child = rootChildren.at(k);
                if (child) traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        console.warn("Failed to iterate root children", e);
    }

    return { lines, image };
}

console.log(extractPagePreview(page));
