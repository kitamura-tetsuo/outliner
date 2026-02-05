/**
 * Backlink Collection Utility
 *
 * This module provides functionality to collect backlinks (links from other pages) to a page.
 */

import type { Item } from "../schema/yjs-schema";
import { store } from "../stores/store.svelte";
import { getLogger } from "./logger";

const logger = getLogger("BacklinkCollector");

/**
 * Type definition for backlink information
 */
export interface Backlink {
    /** Source Page ID */
    sourcePageId: string;
    /** Source Page Name */
    sourcePageName: string;
    /** Source Item ID containing the link */
    sourceItemId: string;
    /** Text of the source item containing the link */
    sourceItemText: string;
    /** Context surrounding the link */
    context: string;
}

/**
 * Collects backlinks to the specified page
 * @param targetPageName Name of the target page
 * @returns Array of backlinks
 */
export function collectBacklinks(targetPageName: string): Backlink[] {
    if (!store.pages || !targetPageName) {
        return [];
    }

    const backlinks: Backlink[] = [];
    const normalizedTargetName = targetPageName.toLowerCase();

    // Create regex outside the loop (performance optimization)
    // [page-name] format
    const escapedTargetName = escapeRegExp(normalizedTargetName); // Note: RegExp "i" flag handles casing
    const internalLinkPattern = new RegExp(`\\[${escapedTargetName}\\]`, "i");

    // Regex pattern for internal project links
    // [/project-name/page-name] format
    const currentProject = store.project?.title || "";
    const escapedCurrentProject = escapeRegExp(currentProject);
    const projectLinkPattern = new RegExp(
        `\\[\\/${escapedCurrentProject}\\/${escapedTargetName}\\]`,
        "i",
    );

    // Generic pattern for extractContext (considers different project names)
    // NOTE: extractContext logic used `\\[\\/.+\\/${escapeRegExp(targetPageName)}\\]` which matches any project
    const anyProjectLinkPattern = new RegExp(`\\[\\/.+\\/${escapedTargetName}\\]`, "i");

    try {
        // Search all pages
        const pages = store.pages.current;
        if (!pages) {
            return backlinks;
        }

        // Optimization: Iterate directly to avoid O(N log N) sorting caused by items.length check or default iterator
        // (Items iterator triggers a full sort of children keys in app-schema.ts)
        const pagesIterator = (typeof (pages as any).iterateUnordered === "function")
            ? { [Symbol.iterator]: () => (pages as any).iterateUnordered() }
            : pages;

        for (const page of pagesIterator) {
            const pageItem = page as any as Item;

            const pText = pageItem.text;
            const pageHasText = pText && pText.length > 0;
            const pageText = pageHasText ? String(pText) : "";

            // Exclude the target page itself
            if (pageHasText && pageText.toLowerCase() === normalizedTargetName) {
                continue;
            }

            // Check the page's own text
            // Fast path: check if text contains '[' before running regex
            if (
                pageHasText && pageText.includes("[")
                && (internalLinkPattern.test(pageText) || projectLinkPattern.test(pageText))
            ) {
                backlinks.push({
                    sourcePageId: pageItem.id,
                    sourcePageName: pageText,
                    sourceItemId: pageItem.id,
                    sourceItemText: pageText,
                    context: extractContext(pageText, internalLinkPattern, anyProjectLinkPattern),
                });
            }

            // Check child items
            const items = pageItem.items as Iterable<Item> & { iterateUnordered?: () => Iterator<Item>; };
            // Optimization: Iterate directly to avoid O(N log N) sorting caused by items.length check
            // (Items.length getter triggers a full sort of children keys in app-schema.ts)
            // Also prefer iterateUnordered to avoid sorting completely
            if (items) {
                const iterator = (typeof items.iterateUnordered === "function")
                    ? { [Symbol.iterator]: () => items.iterateUnordered!() }
                    : items;

                for (const item of iterator) {
                    const text = item.text;
                    // Optimization: skip empty text to avoid expensive toString() (Y.Text deserialization)
                    if (!text || text.length === 0) continue;

                    const itemText = String(text);
                    // Fast path: check if text contains '[' before running regex
                    if (
                        item && itemText.includes("[")
                        && (internalLinkPattern.test(itemText) || projectLinkPattern.test(itemText))
                    ) {
                        backlinks.push({
                            sourcePageId: pageItem.id,
                            sourcePageName: pageText,
                            sourceItemId: item.id,
                            sourceItemText: itemText,
                            context: extractContext(itemText, internalLinkPattern, anyProjectLinkPattern),
                        });
                    }
                }
            }
        }

        logger.info(`Collected ${backlinks.length} backlinks for page: ${targetPageName}`);
        return backlinks;
    } catch (error) {
        logger.error({ error }, `Error collecting backlinks for page ${targetPageName}`);
        return [];
    }
}

/**
 * Extracts context around the link
 * @param text Original text
 * @param internalLinkPattern Internal link pattern
 * @param projectLinkPattern Project link pattern
 * @returns Context string
 */
function extractContext(text: string, internalLinkPattern: RegExp, projectLinkPattern: RegExp): string {
    if (!text) return "";

    // Identify link position
    const internalMatch = text.match(internalLinkPattern);
    const projectMatch = text.match(projectLinkPattern);

    let linkPosition = -1;
    let linkLength = 0;

    if (internalMatch && internalMatch.index !== undefined) {
        linkPosition = internalMatch.index;
        linkLength = internalMatch[0].length;
    } else if (projectMatch && projectMatch.index !== undefined) {
        linkPosition = projectMatch.index;
        linkLength = projectMatch[0].length;
    }

    if (linkPosition === -1) return text;

    // Extract 20 characters before and after the link
    const contextStart = Math.max(0, linkPosition - 20);
    const contextEnd = Math.min(text.length, linkPosition + linkLength + 20);

    let context = text.substring(contextStart, contextEnd);

    // Add "..." to the beginning/end (if necessary)
    if (contextStart > 0) {
        context = "..." + context;
    }
    if (contextEnd < text.length) {
        context = context + "...";
    }

    return context;
}

/**
 * Escapes special characters for RegExp
 * @param string String to escape
 * @returns Escaped string
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Gets the count of backlinks to the specified page
 * @param pageName Page name
 * @returns Count of backlinks
 */
export function getBacklinkCount(pageName: string): number {
    return collectBacklinks(pageName).length;
}
