export interface PresenceUser {
    userId: string;
    userName: string;
    color: string;
}

export class PresenceStore {
    // Use a plain mutable object to avoid relying on Svelte 5 runes
    // in non-.svelte component runtime contexts (e.g., Playwright/Vite tests).
    users: Record<string, PresenceUser> = {};

    setUser(user: PresenceUser) {
        this.users = { ...this.users, [user.userId]: user };
        try {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("presence-users-changed"));
            }
        } catch {}
    }

    removeUser(userId: string) {
        const { [userId]: _, ...rest } = this.users; // eslint-disable-line @typescript-eslint/no-unused-vars
        this.users = rest;
        this.users = rest;
        try {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("presence-users-changed"));
            }
        } catch {}
    }

    getUsers(): PresenceUser[] {
        return Object.values(this.users);
    }

    // tests 6 re-initialization
    reset() {
        this.users = {};
    }
}

export const presenceStore = $state(new PresenceStore());
if (typeof window !== "undefined") {
    window.presenceStore = presenceStore;
}
