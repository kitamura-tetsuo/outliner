import { browser } from "$app/environment";
import { writable } from "svelte/store";

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

function createHistory() {
    const { subscribe, update } = writable<string[]>(loadInitial());

    function persist(values: string[]) {
        if (browser) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        }
    }

    return {
        subscribe,
        add(title: string) {
            update(list => {
                const idx = list.indexOf(title);
                if (idx !== -1) list.splice(idx, 1);
                list.unshift(title);
                if (list.length > 20) list.pop();
                persist(list);
                return list;
            });
        },
    };
}

export const searchHistoryStore = createHistory();
