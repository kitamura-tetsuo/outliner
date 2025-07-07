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
    private _history = $state<string[]>(loadInitial());

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
}

export const searchHistoryStore = new SearchHistoryStore();
