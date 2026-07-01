import { getLogger } from "./logger";
const logger = getLogger("pagePreview");

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
                        if ("url" in val && typeof (val as Record<string, unknown>).url === "string") {
                            image = (val as Record<string, unknown>).url as string;
                        } else if (
                            Array.isArray(val) && (val as unknown[]).length > 0
                            && typeof (val as unknown[])[0] === "string"
                        ) {
                            image = (val as unknown[])[0] as string;
                        }
                    }
                }
            } catch (e) {
                logger.warn("Failed to extract attachment", e);
            }
        }

        let text = "";
        try {
            const val = item.text;
            text = val ? (typeof val === "string" ? val.trim() : String(val).trim()) : "";
        } catch (e) {
            logger.warn("Failed to extract text", e);
        }

        if (text && lines.length < maxLines && item.id !== pageItem.id) {
            lines.push(text);
        }

        if (currentDepth >= maxDepth) return;

        try {
            if (item.items) {
                let i = 0;
                const items = item.items;
                if (!items || typeof items[Symbol.iterator] !== "function") return;
                for (const child of items) {
                    if (i++ > 10) break;
                    if (child) traverse(child, currentDepth + 1);
                    if (lines.length >= maxLines && image) return;
                    if (nodeCount >= maxNodes) return;
                }
            }
        } catch (e) {
            logger.warn("Failed to iterate children", e);
        }
    }

    try {
        if (pageItem.items) {
            let i = 0;
            const items = pageItem.items;
            if (!items || typeof items[Symbol.iterator] !== "function") return { lines, image };
            for (const child of items) {
                if (i++ > 20) break;
                if (child) traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        logger.warn("Failed to iterate root children", e);
    }

    return { lines, image };
}
