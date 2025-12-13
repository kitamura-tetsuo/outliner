// Setup file for integration tests
import { vi } from "vitest";
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

// Enhanced mock for y-websocket to simulate WebSocket connections in tests
class MockWebsocketProvider {
    public doc: Y.Doc;
    public awareness: Awareness;
    public wsconnected: boolean = false;
    public synced: boolean = false;
    public roomname: string;

    // Registry of all providers by room
    static rooms: Map<string, Set<MockWebsocketProvider>> = new Map();

    // Simple event emitter implementation for testing
    private eventListeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

    constructor(
        serverUrl: string,
        roomname: string,
        doc: Y.Doc,
    ) {
        this.doc = doc;
        this.roomname = roomname;
        this.awareness = new Awareness(doc);

        // Register this provider to the room
        if (!MockWebsocketProvider.rooms.has(roomname)) {
            MockWebsocketProvider.rooms.set(roomname, new Set());
        }
        MockWebsocketProvider.rooms.get(roomname)!.add(this);

        // Listen for doc updates to broadcast
        this.doc.on("update", this.handleDocUpdate);

        // Listen for awareness updates to broadcast
        this.awareness.on("update", this.handleAwarenessUpdate);

        // Simulate connection in test environment
        setTimeout(() => {
            this.wsconnected = true;
            this.synced = true;
            // Emit sync event to simulate successful connection
            this.emit("sync", [true]);
            this.emit("status", [{ connected: true }]);

            // Sync with existing peers in the room
            this.syncWithPeers();
        }, 10);
    }

    private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
        // Only broadcast if the update originated locally (not from another provider)
        if (origin instanceof MockWebsocketProvider) return;

        this.broadcastToRoom((peer) => {
            Y.applyUpdate(peer.doc, update, this);
        });
    };

    private handleAwarenessUpdate = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[]; },
        origin: unknown,
    ) => {
        if (origin instanceof MockWebsocketProvider) return;

        const changedClients = added.concat(updated).concat(removed);
        const update = encodeAwarenessUpdate(this.awareness, changedClients);

        this.broadcastToRoom((peer) => {
            applyAwarenessUpdate(peer.awareness, update, this);
        });
    };

    private broadcastToRoom(action: (peer: MockWebsocketProvider) => void) {
        const peers = MockWebsocketProvider.rooms.get(this.roomname);
        if (peers) {
            peers.forEach(peer => {
                if (peer !== this) {
                    try {
                        action(peer);
                    } catch (e) {
                        console.error("Error broadcasting to peer:", e);
                    }
                }
            });
        }
    }

    private syncWithPeers() {
        const peers = MockWebsocketProvider.rooms.get(this.roomname);
        if (!peers) return;

        peers.forEach(peer => {
            if (peer === this) return;

            // 1. Sync Doc state
            // Send my state to peer
            const myState = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(peer.doc));
            if (myState.length > 0) {
                Y.applyUpdate(peer.doc, myState, this);
            }
            // Receive peer state
            const peerState = Y.encodeStateAsUpdate(peer.doc, Y.encodeStateVector(this.doc));
            if (peerState.length > 0) {
                Y.applyUpdate(this.doc, peerState, peer);
            }

            // 2. Sync Awareness
            // Send my awareness
            const myAwarenessState = encodeAwarenessUpdate(
                this.awareness,
                Array.from(this.awareness.getStates().keys()),
            );
            if (myAwarenessState.length > 0) {
                applyAwarenessUpdate(peer.awareness, myAwarenessState, this);
            }
            // Receive peer awareness
            const peerAwarenessState = encodeAwarenessUpdate(
                peer.awareness,
                Array.from(peer.awareness.getStates().keys()),
            );
            if (peerAwarenessState.length > 0) {
                applyAwarenessUpdate(this.awareness, peerAwarenessState, peer);
            }
        });
    }

    public connect() {
        this.wsconnected = true;
        // Should we sync on connect?
        if (!this.synced) {
            this.emit("sync", [true]);
            this.synced = true;
        }
        this.emit("status", [{ connected: true }]);
    }

    public disconnect() {
        this.wsconnected = false;
        this.emit("status", [{ connected: false }]);
    }

    public destroy() {
        // Cleanup
        this.doc.off("update", this.handleDocUpdate);
        this.awareness.off("update", this.handleAwarenessUpdate);
        const peers = MockWebsocketProvider.rooms.get(this.roomname);
        if (peers) {
            peers.delete(this);
            if (peers.size === 0) {
                MockWebsocketProvider.rooms.delete(this.roomname);
            }
        }
    }

    public on(event: string, callback: (...args: unknown[]) => void) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)?.push(callback);
    }

    public off(event: string, callback: (...args: unknown[]) => void) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    public emit(event: string, args: unknown[] = []) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(...args);
                } catch (e) {
                    console.error("Error in event listener:", e);
                }
            });
        }
    }
}

// Mock the y-websocket module
vi.mock("y-websocket", () => {
    return {
        WebsocketProvider: MockWebsocketProvider,
    };
});
