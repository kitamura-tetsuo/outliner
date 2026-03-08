import { Project, Item } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
const i2 = page.items.addNode("author");
i2.updateText("Line 2");

const pageItem = proj.items.at(0)!; // this is how it might be accessed

// Replicate exactly the code in PageListItem.svelte
function extractPagePreview(pageItem: Item, maxLines: number = 3, maxDepth: number = 3) {
    const lines: string[] = [];
    let image: string | null = null;
    let nodeCount = 0;
    const maxNodes = 50;

    function traverse(item: Item, currentDepth: number) {
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
                // DO NOT do item.items.length
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
            // Iterate using for..of instead of length/at
            for (const child of pageItem.items) {
                if (i++ > 20) break;
                if (child) traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        console.warn("Failed to iterate root children", e);
    }

    return { lines, image };
}

console.log(extractPagePreview(pageItem));
