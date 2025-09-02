export interface PresenceUser {
    userId: string;
    userName: string;
    color: string;
    cursor?: {
        itemId: string;
        offset: number;
    };
    selection?: {
        startItemId: string;
        startOffset: number;
        endItemId: string;
        endOffset: number;
    };
    lastSeen?: number;
    source?: "fluid" | "yjs"; // データソースを識別
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

    getUsers(): PresenceUser[] {
        return Object.values(this.users);
    }

    /**
     * Yjsプレゼンス情報を更新
     */
    updateYjsPresence(states: Map<number, any>) {
        const yjsUsers: Record<string, PresenceUser> = {};

        states.forEach((state) => {
            if (state.userId) {
                yjsUsers[state.userId] = {
                    userId: state.userId,
                    userName: state.userName,
                    color: state.color,
                    cursor: state.cursor,
                    selection: state.selection,
                    lastSeen: state.lastSeen,
                    source: "yjs",
                };
            }
        });

        // 既存のFluidユーザーを保持しつつ、Yjsユーザーを更新
        const updatedUsers = { ...this.users };

        // 古いYjsユーザーを削除
        Object.keys(updatedUsers).forEach(userId => {
            if (updatedUsers[userId].source === "yjs") {
                delete updatedUsers[userId];
            }
        });

        // 新しいYjsユーザーを追加
        Object.assign(updatedUsers, yjsUsers);

        this.users = updatedUsers;
    }

    /**
     * 特定ソースのユーザーを取得
     */
    getUsersBySource(source: "fluid" | "yjs"): PresenceUser[] {
        return this.getUsers().filter(user => user.source === source);
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
