import { browser } from "$app/environment";

const STORAGE_KEY = "pageSearchHistory";

function loadInitial(): string[] {
    if (!browser) return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function persist(values: string[]) {
    if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    }
}

class SearchHistoryStore {
    private _history: string[] = $state(loadInitial());

    get history(): string[] {
        return this._history;
    }

    add(title: string) {
        const list = [...this._history];
        const idx = list.indexOf(title);
        if (idx !== -1) list.splice(idx, 1);
        list.unshift(title);
        if (list.length > 20) list.pop();
        this._history = list;
        persist(list);
    }

    /**
     * Follow a page rename. History entries are keyed by title, so without this
     * the recent-page list keeps offering a title that no longer resolves.
     */
    rename(oldTitle: string, newTitle: string) {
        if (!oldTitle || !newTitle || oldTitle === newTitle) return;
        const idx = this._history.indexOf(oldTitle);
        if (idx === -1) return;
        const list = [...this._history];
        list[idx] = newTitle;
        // A page already listed under the new title would now appear twice.
        this._history = list.filter((title, i) => i === idx || title !== newTitle);
        persist(this._history);
    }

    reset() {
        this._history = [];
        persist(this._history);
    }
}

export const searchHistoryStore = $state(new SearchHistoryStore());
