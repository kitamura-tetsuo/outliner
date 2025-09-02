import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import { colorForUser, presenceStore, type PresenceUser } from "../../stores/PresenceStore.svelte";

export class YjsPresenceService {
    private doc: Y.Doc;
    private awareness: awarenessProtocol.Awareness;
    private channel: BroadcastChannel;
    private clientUsers = new Map<number, string>();

    constructor(room: string, user: { userId: string; userName: string; }) {
        this.doc = new Y.Doc();
        this.awareness = new awarenessProtocol.Awareness(this.doc);
        this.channel = new BroadcastChannel(`yjs-${room}`);

        this.channel.onmessage = (ev: MessageEvent) => {
            const data = new Uint8Array(ev.data);
            awarenessProtocol.applyAwarenessUpdate(this.awareness, data, "remote");
        };

        this.awareness.on("update", ({ added, updated, removed }, origin) => {
            const states = this.awareness.getStates();
            for (const clientId of added.concat(updated)) {
                const state = states.get(clientId) as any;
                const u = state?.user as PresenceUser | undefined;
                if (u) {
                    presenceStore.setUser(u);
                    this.clientUsers.set(clientId, u.userId);
                    if (state.cursor) {
                        presenceStore.updateCursor(u.userId, state.cursor);
                    }
                }
            }
            for (const clientId of removed) {
                const uid = this.clientUsers.get(clientId);
                if (uid) {
                    presenceStore.removeUser(uid);
                    this.clientUsers.delete(clientId);
                }
            }
            if (origin !== "remote") {
                const changed = added.concat(updated).concat(removed);
                const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
                this.channel.postMessage(update);
            }
        });

        this.awareness.setLocalStateField("user", {
            userId: user.userId,
            userName: user.userName,
            color: colorForUser(user.userId),
        } as PresenceUser);
    }

    updateCursor(pos: { left: number; top: number; }) {
        this.awareness.setLocalStateField("cursor", pos);
        const state = this.awareness.getLocalState() as any;
        const u = state?.user as PresenceUser | undefined;
        if (u) {
            presenceStore.updateCursor(u.userId, pos);
        }
    }

    destroy() {
        this.awareness.destroy();
        this.channel.close();
        this.doc.destroy();
    }
}

let service: YjsPresenceService | null = null;

export function initYjsPresence(room: string, user: { userId: string; userName: string; }) {
    if (!service) {
        service = new YjsPresenceService(room, user);
    }
    return service;
}

export function getYjsService() {
    return service;
}
