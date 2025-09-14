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
        const { [userId]: _removed, ...rest } = this.users;
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
}

export function colorForUser(id: string): string {
    let hash = 0;
    for (const ch of id) {
        hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    }
    return `hsl(${hash}, 70%, 50%)`;
}

export const presenceStore = new PresenceStore();
if (typeof window !== "undefined") {
    (window as any).presenceStore = presenceStore;
}
