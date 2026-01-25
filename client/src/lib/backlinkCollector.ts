import * as Y from "yjs";
import { Item, type Items } from "../schema/app-schema";
import { type Backlink, backlinkStore } from "../stores/BacklinkStore.svelte";
import { store } from "../stores/store.svelte";
import { getLogger } from "./logger";

const logger = getLogger("backlinkCollector");

export type { Backlink };

/**
 * Collect backlinks related to the specified page name
 * @param targetPageName Page name to collect backlinks for
 * @returns List of backlinks
 */
export function collectBacklinks(targetPageName: string): Backlink[] {
    if (!targetPageName) return [];

    logger.debug(`Starting backlink collection for: ${targetPageName}`);
    const results: Backlink[] = [];
    const project = store.project;

    if (!project) {
        logger.warn("Project not found, skipping backlink collection");
        return [];
    }

    const processedPages = new Set<string>();

    // 1. Search from Yjs document (for pages not yet in Store)
    try {
        if (project.items) {
            // Using for...of loop for Items (Symbol.iterator is implemented)
            for (const page of project.items) {
                // Skip if page ID is not string or page name is empty
                if (!page.id || !page.text) continue;

                // Skip target page itself
                if (page.text === targetPageName) continue;

                processedPages.add(page.id);
                collectLinksFromPage(page, targetPageName, results);
            }
        }
    } catch (err) {
        logger.error("Error collecting from project items:", err);
    }

    // 2. Search from BacklinkStore (cached information)
    // Currently, re-collection from Yjs is primary, Store is auxiliary use
    // (Implementation of BacklinkStore is simple and mainly holds results)

    logger.info(`Found ${results.length} backlinks`);

    // Update store
    backlinkStore.setBacklinks(targetPageName, results);

    return results;
}

/**
 * Collect links from within a page
 */
function collectLinksFromPage(page: Item, targetName: string, results: Backlink[]) {
    // 1. Check page title (though usually not a link to itself)
    // 2. Recursively check items in the page

    if (page.items) {
        // Recursively search items
        collectLinksFromItems(page.items, page, targetName, results);
    }
}

/**
 * Recursively search items
 */
function collectLinksFromItems(items: Items, sourcePage: Item, targetName: string, results: Backlink[]) {
    for (const item of items) {
        // Check text
        if (item.text) {
            // Optimization: Skip Yjs deserialization if empty string
            // item.text is Y.Text, toString() is costly
            // Y.Text does not have a length property directly exposed in types sometimes,
            // but we can check if it has content.
            // For safety, just convert to string.
            const text = item.text.toString();

            if (text.includes(`[${targetName}]`) || text.includes(`[[${targetName}]]`)) {
                results.push({
                    sourcePageId: sourcePage.id,
                    sourcePageName: sourcePage.text || "Untitled Page",
                    context: text,
                    targetPageName: targetName,
                });
            }
        }

        // Recursive call
        if (item.items && item.items.length > 0) {
            collectLinksFromItems(item.items, sourcePage, targetName, results);
        }
    }
}

/**
 * Extract links from text (simple regex)
 * @param text Text to check
 * @returns Array of linked page names
 */
export function extractLinks(text: string): string[] {
    const links: string[] = [];

    // [[Page Name]] format
    const bracketMatches = text.match(/\[\[(.+?)\]\]/g);
    if (bracketMatches) {
        bracketMatches.forEach(match => {
            const name = match.slice(2, -2);
            links.push(name);
        });
    }

    // [Page Name] format (excluding external links)
    // Note: This is a simple implementation, strict parsing requires more complex logic
    const singleBracketMatches = text.match(/\[([^\[\]]+?)\]/g);
    if (singleBracketMatches) {
        singleBracketMatches.forEach(match => {
            const content = match.slice(1, -1);
            // Exclude external links (starting with http) and Gyazo/Scrapbox decorations
            if (!content.startsWith("http") && !content.match(/^[*/-]/)) {
                links.push(content);
            }
        });
    }

    return links;
}
