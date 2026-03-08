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

        if (!image && item.attachments) {
            try {
                const arr = item.attachments.toArray();
                if (arr && arr.length > 0) {
                    const val = arr[0];
                    if (typeof val === "string") {
                        image = val;
                    } else if (val && typeof val === "object") {
                        if ("url" in val) {
                            image = (val as any).url;
                        } else if (Array.isArray(val) && val.length > 0) {
                            image = val[0];
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to extract attachment", e);
            }
        }

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
                const children = item.items;
                // DO NOT use children.length or children.at() directly
                // Instead, use the iterable nature
                let i = 0;
                for (const child of children) {
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
            const rootChildren = pageItem.items;
            // Iterate using for..of instead of length/at
            for (const child of rootChildren) {
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
