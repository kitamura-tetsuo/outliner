import type { Item } from "../schema/app-schema";

export function extractPagePreview(pageItem: Item, maxLines: number = 3, maxDepth: number = 3) {
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
                        } else if (Array.isArray(val) && (val as any[]).length > 0) {
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
    }

    return { lines, image };
}
