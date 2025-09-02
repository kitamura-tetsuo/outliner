export interface PresenceUser {
    userId: string;
    userName: string;
    color: string;
    cursor?: { left: number; top: number; };
}

export class PresenceStore {
    users = $state<Record<string, PresenceUser>>({});

    setUser(user: PresenceUser) {
        this.users = { ...this.users, [user.userId]: user };
    }

    removeUser(userId: string) {
        const { [userId]: _removed, ...rest } = this.users;
        this.users = rest;
    }

    updateCursor(userId: string, pos: { left: number; top: number; }) {
        const user = this.users[userId];
        if (user) {
            this.users = { ...this.users, [userId]: { ...user, cursor: pos } };
        }
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
