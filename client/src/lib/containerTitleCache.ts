/**
 * Client-side container title cache using localStorage
 * Provides persistent storage for container titles to survive page reloads
 */

import { getLogger } from "./logger";

const logger = getLogger("ContainerTitleCache");
const CACHE_KEY = "outliner_container_titles";

export interface ContainerTitleMap {
    [containerId: string]: string;
}

/**
 * Container title cache utility class
 */
export class ContainerTitleCache {
    private cache: ContainerTitleMap = {};
    private isInitialized = false;

    constructor() {
        this.loadFromStorage();
    }

    /**
     * Load cached titles from localStorage
     */
    private loadFromStorage(): void {
        try {
            if (typeof window === "undefined") {
                // SSR environment - skip localStorage access
                this.isInitialized = true;
                return;
            }

            const stored = window.localStorage.getItem(CACHE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (typeof parsed === "object" && parsed !== null) {
                    this.cache = parsed;
                    logger.info("Loaded container titles from cache");
                }
            }
        } catch (error) {
            logger.warn({ error }, "Failed to load container titles from localStorage");
            this.cache = {};
        }
        this.isInitialized = true;
    }

    /**
     * Save current cache to localStorage
     */
    private saveToStorage(): void {
        try {
            if (typeof window === "undefined") {
                return;
            }

            window.localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache));
            logger.debug("Saved container titles to cache");
        } catch (error) {
            logger.warn({ error }, "Failed to save container titles to localStorage");
        }
    }

    /**
     * Get a container title from cache
     */
    getTitle(containerId: string): string | undefined {
        if (!this.isInitialized) {
            this.loadFromStorage();
        }
        return this.cache[containerId];
    }

    /**
     * Set a container title in cache
     */
    setTitle(containerId: string, title: string): void {
        if (!containerId || typeof title !== "string") {
            return;
        }

        if (!this.isInitialized) {
            this.loadFromStorage();
        }

        // Only update if the title is meaningful (not empty or default)
        const trimmedTitle = title.trim();
        if (trimmedTitle && trimmedTitle !== "プロジェクト") {
            this.cache[containerId] = trimmedTitle;
            this.saveToStorage();
            logger.debug("Cached container title");
        }
    }

    /**
     * Remove a container title from cache
     */
    removeTitle(containerId: string): void {
        if (!this.isInitialized) {
            this.loadFromStorage();
        }

        if (containerId in this.cache) {
            delete this.cache[containerId];
            this.saveToStorage();
            logger.debug("Removed container title from cache");
        }
    }

    /**
     * Get all cached titles
     */
    getAllTitles(): ContainerTitleMap {
        if (!this.isInitialized) {
            this.loadFromStorage();
        }
        return { ...this.cache };
    }

    /**
     * Clear all cached titles
     */
    clear(): void {
        this.cache = {};
        this.saveToStorage();
        logger.info("Cleared all container titles from cache");
    }

    /**
     * Get cache statistics
     */
    getStats(): { count: number; size: number; } {
        if (!this.isInitialized) {
            this.loadFromStorage();
        }

        const count = Object.keys(this.cache).length;
        const size = JSON.stringify(this.cache).length;
        return { count, size };
    }
}

// Export singleton instance
export const containerTitleCache = new ContainerTitleCache();
