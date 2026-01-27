import { getPreviewContent, type PreviewContent } from "../services/linkPreviewService";
import { getLogger } from "./logger";

const logger = getLogger("linkPreviewHandler");

// Cache preview content
const previewCache = new Map<string, PreviewContent>();

// Time limit for cache (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

/**
 * Get preview content (use cache if available)
 */
export async function getCachedPreviewContent(targetId: string, targetName: string): Promise<PreviewContent | null> {
    const now = Date.now();

    // Check cache
    if (previewCache.has(targetId)) {
        const timestamp = cacheTimestamps.get(targetId) || 0;
        if (now - timestamp < CACHE_TTL) {
            logger.debug(`Cache hit for: ${targetName} (${targetId})`);
            return previewCache.get(targetId)!;
        } else {
            // Expired
            previewCache.delete(targetId);
            cacheTimestamps.delete(targetId);
        }
    }

    try {
        const content = await getPreviewContent(targetId, targetName);
        if (content) {
            // Save to cache
            previewCache.set(targetId, content);
            cacheTimestamps.set(targetId, now);
        }
        return content;
    } catch (error) {
        logger.error(`Failed to get preview for ${targetName}:`, error);
        return null;
    }
}

/**
 * Clear cache
 */
export function clearPreviewCache() {
    previewCache.clear();
    cacheTimestamps.clear();
}

/**
 * Setup link preview handlers
 */
export function setupLinkPreviewHandlers() {
    logger.debug("setupLinkPreviewHandlers: Initializing link preview listeners");
    // This could optionally scan the DOM for links and attach hover listeners
    // if we weren't using the Svelte component approach, but for now it's a stub
    // to satisfy the imports in +page.svelte.
}

/**
 * Cleanup link previews
 */
export function cleanupLinkPreviews() {
    logger.debug("cleanupLinkPreviews: Cleaning up link preview resources");
    clearPreviewCache();
}
