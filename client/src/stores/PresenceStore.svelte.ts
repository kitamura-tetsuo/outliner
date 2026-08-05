import { getLogger } from "../lib/logger";
const logger = getLogger("PresenceStore.svelte");

export interface PresenceUser {
    userId: string;
    userName: string;
    color: string;
}

export class PresenceStore {
    // Use a plain mutable object to avoid relying on Svelte 5 runes
    // in non-.svelte component runtime contexts (e.g., Playwright/Vite tests).
    users: Record<string, PresenceUser> = $state({});

    setUser(user: PresenceUser) {
        this.users = { ...this.users, [user.userId]: user };
        try {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("presence-users-changed"));
            }
        } catch (_e) {
            logger.error(_e);
        }
    }

    removeUser(userId: string) {
        const { [userId]: _, ...rest } = this.users;
        this.users = rest;
        try {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("presence-users-changed"));
            }
        } catch (_e) {
            logger.error(_e);
        }
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
// The literal MODE comparison lets Rollup drop this assignment from the
// production bundle (see ENV-production-build-leak.test.ts).
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    window.presenceStore = presenceStore;
}
