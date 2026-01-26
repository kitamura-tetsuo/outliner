import * as Y from "yjs";
import { getLogger } from "./logger";

const logger = getLogger("backlinkCollector");

// Remove unused 'Y' import warning by not importing it if not used,
// but here we use it for type definitions usually.
// If completely unused in value space:
// import type * as Y from "yjs";

/**
 * Collects backlinks from the entire Y.Doc.
 *
 * @param doc The Y.Doc to scan.
 * @returns A map where keys are page IDs and values are sets of linking page IDs.
 */
export function collectBacklinks(doc: Y.Doc): Map<string, Set<string>> {
    const backlinks = new Map<string, Set<string>>();
    const projectMap = doc.getMap("project");
    const pagesMap = projectMap.get("pages") as Y.Map<any>;

    if (!pagesMap) {
        return backlinks;
    }

    // Iterate over all pages
    for (const [pageId, pageData] of pagesMap.entries()) {
        const itemsMap = pageData.get("items") as Y.Map<any>;
        if (!itemsMap) continue;

        // Scan items in the page
        // Note: This is a simplified scan. A real implementation might need to traverse the tree.
        // Assuming a flat or easily accessible structure for simplicity here,
        // or just iterating all values if items is a Map of all items in page.

        // If items structure is flat map of itemId -> Item
        for (const item of itemsMap.values()) {
            const text = item.get("text");
            if (typeof text === "string") {
                extractLinks(text).forEach(targetPageTitle => {
                    // Convert title to ID? Or store by title?
                    // Assuming we track by Title for now as Scrapbox does.
                    // If we need ID, we'd need a Title->ID index.

                    // For now, let's just log or store raw target.
                    if (!backlinks.has(targetPageTitle)) {
                        backlinks.set(targetPageTitle, new Set());
                    }
                    backlinks.get(targetPageTitle)?.add(pageId);
                });
            } else if (text instanceof Y.Text) {
                // Optimization: check length before string conversion
                if (text.length > 0) {
                    extractLinks(text.toString()).forEach(targetPageTitle => {
                        if (!backlinks.has(targetPageTitle)) {
                            backlinks.set(targetPageTitle, new Set());
                        }
                        backlinks.get(targetPageTitle)?.add(pageId);
                    });
                }
            }
        }
    }

    return backlinks;
}

/**
 * Extracts internal links from text.
 * Matches [Page Title] format.
 */
function extractLinks(text: string): string[] {
    const links: string[] = [];
    // Regex for [Link]
    // Avoid matching [http...] or decorations like [* bold]
    // Simple regex: \[([^\]]+)\]
    // Need to filter out special chars.

    const regex = /\[([^\]]+)\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const content = match[1];
        // Filter out URLs
        if (content.match(/^https?:\/\//)) continue;
        // Filter out decorations
        if (content.match(/^[\*\/\\-] /)) continue; // Removed unnecessary escape for *

        links.push(content);
    }

    return links;
}
