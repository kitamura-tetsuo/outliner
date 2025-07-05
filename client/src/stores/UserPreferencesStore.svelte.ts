export interface UserPreferences {
    theme: "light" | "dark";
}

const STORAGE_KEY = "user-preferences";

function loadPreferencesFromStorage(): UserPreferences {
    if (typeof window === "undefined") {
        return { theme: "light" };
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { theme: parsed.theme === "dark" ? "dark" : "light" };
        }
    }
    catch (error) {
        console.warn("Failed to load user preferences from localStorage:", error);
    }

    return { theme: "light" };
}

function savePreferencesToStorage(preferences: UserPreferences) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
    catch (error) {
        console.warn("Failed to save user preferences to localStorage:", error);
    }
}

export class UserPreferencesStore {
    preferences = $state<UserPreferences>(loadPreferencesFromStorage());

    theme = $derived(this.preferences.theme);

    setTheme(theme: "light" | "dark") {
        this.preferences = { ...this.preferences, theme };
        savePreferencesToStorage(this.preferences);
    }

    toggleTheme() {
        this.setTheme(this.preferences.theme === "light" ? "dark" : "light");
    }
}

export const userPreferencesStore = new UserPreferencesStore();

if (typeof window !== "undefined") {
    (window as any).userPreferencesStore = userPreferencesStore;
}
