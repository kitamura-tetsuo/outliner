import { browser } from "$app/environment";

const STORAGE_KEY = "pageViewCountHistory";

function loadInitial(): Record<string, number> {
    if (!browser) return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function persist(values: Record<string, number>) {
    if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    }
}

class PageViewStore {
    private _counts: Record<string, number> = $state(loadInitial());

    get counts(): Record<string, number> {
        return this._counts;
    }

    get(title: string): number {
        return this._counts[title] || 0;
    }

    increment(title: string) {
        if (!title) return;
        const newCounts = { ...this._counts };
        newCounts[title] = (newCounts[title] || 0) + 1;
        this._counts = newCounts;
        persist(this._counts);
    }

    /**
     * Follow a page rename so the view count stays with the page instead of
     * being stranded under a title that no longer exists.
     */
    rename(oldTitle: string, newTitle: string) {
        if (!oldTitle || !newTitle || oldTitle === newTitle) return;
        if (!(oldTitle in this._counts)) return;
        const newCounts = { ...this._counts };
        newCounts[newTitle] = (newCounts[newTitle] || 0) + newCounts[oldTitle];
        delete newCounts[oldTitle];
        this._counts = newCounts;
        persist(this._counts);
    }

    reset() {
        this._counts = {};
        persist(this._counts);
    }
}

export const pageViewStore = new PageViewStore();
