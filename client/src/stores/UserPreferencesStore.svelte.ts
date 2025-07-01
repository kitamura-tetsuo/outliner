export interface UserPreferences {
    theme: 'light' | 'dark';
}

export class UserPreferencesStore {
    preferences = $state<UserPreferences>({ theme: 'light' });

    theme = $derived(this.preferences.theme);

    setTheme(theme: 'light' | 'dark') {
        this.preferences = { ...this.preferences, theme };
    }

    toggleTheme() {
        this.setTheme(this.preferences.theme === 'light' ? 'dark' : 'light');
    }
}

export const userPreferencesStore = new UserPreferencesStore();

if (typeof window !== 'undefined') {
    (window as any).userPreferencesStore = userPreferencesStore;
}
