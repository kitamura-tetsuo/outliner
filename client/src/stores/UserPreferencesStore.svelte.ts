import { getLogger } from "../lib/logger";
const logger = getLogger("Store");
export interface UserPreferences {
    theme: "light" | "dark";
    collapsedItems?: Record<string, string[]>;
}

const STORAGE_KEY = "user-preferences";

function loadPreferencesFromStorage(): UserPreferences {
    if (typeof window === "undefined") {
        return { theme: "light", collapsedItems: {} };
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                theme: parsed.theme === "dark" ? "dark" : "light",
                collapsedItems: parsed.collapsedItems || {},
            };
        }
    } catch (error) {
        logger.warn("Failed to load user preferences from localStorage:", error);
    }

    return { theme: "light", collapsedItems: {} };
}

function savePreferencesToStorage(preferences: UserPreferences) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
        logger.warn("Failed to save user preferences to localStorage:", error);
    }
}

export class UserPreferencesStore {
    preferences: UserPreferences = loadPreferencesFromStorage();

    get theme() {
        return this.preferences.theme;
    }

    setTheme(theme: "light" | "dark") {
        this.preferences = { ...this.preferences, theme };
        savePreferencesToStorage(this.preferences);
        // Reflect theme to document root without using $effect
        if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", theme === "dark");
        }
    }

    toggleTheme() {
        this.setTheme(this.preferences.theme === "light" ? "dark" : "light");
    }

    applyDocumentTheme() {
        if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", this.preferences.theme === "dark");
        }
    }

    getCollapsedState(pageId: string): string[] {
        if (!this.preferences.collapsedItems) {
            this.preferences.collapsedItems = {};
        }
        return this.preferences.collapsedItems[pageId] || [];
    }

    setCollapsedState(pageId: string, itemIds: string[]) {
        if (!this.preferences.collapsedItems) {
            this.preferences.collapsedItems = {};
        }

        // Only trigger reactivity if there's a change or if we're adding a new page
        // Since Set comparisons in JS are by reference, we serialize for comparison
        const currentIds = this.preferences.collapsedItems[pageId] || [];
        if (JSON.stringify(currentIds) === JSON.stringify(itemIds)) {
            return;
        }

        this.preferences = {
            ...this.preferences,
            collapsedItems: {
                ...this.preferences.collapsedItems,
                [pageId]: itemIds,
            },
        };
        savePreferencesToStorage(this.preferences);
    }

    pruneCollapsedState(pageId: string, validItemIds: Set<string>) {
        if (!this.preferences.collapsedItems) return;
        const currentIds = this.preferences.collapsedItems[pageId] || [];
        if (currentIds.length === 0) return;

        const prunedIds = currentIds.filter(id => validItemIds.has(id));

        if (prunedIds.length !== currentIds.length) {
            this.setCollapsedState(pageId, prunedIds);
        }
    }
}

export const userPreferencesStore = $state(new UserPreferencesStore());

if (typeof window !== "undefined") {
    // Debug/test-only handle. The literal MODE comparison lets Rollup drop this
    // assignment from the production bundle (see ENV-production-build-leak.test.ts).
    if (import.meta.env.MODE !== "production") {
        window.userPreferencesStore = userPreferencesStore;
    }
    // Ensure initial theme is applied on startup
    userPreferencesStore.applyDocumentTheme();
}
