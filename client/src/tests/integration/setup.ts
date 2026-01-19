// Setup file for integration tests
import { vi } from "vitest";
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

// Enhanced mock for HocuspocusProvider to simulate WebSocket connections in tests
class MockHocuspocusProvider {
    public doc: Y.Doc;
    public awareness: Awareness;
    public isSynced: boolean = false;
    public name: string;
    public configuration: any;

    // Registry of all providers by room
    static rooms: Map<string, Set<MockHocuspocusProvider>> = new Map();

    // Simple event emitter implementation for testing
    private eventListeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

    constructor(
        configuration: {
            url: string;
            name: string;
            document: Y.Doc;
        },
    ) {
        this.doc = configuration.document;
        this.name = configuration.name;
        this.configuration = configuration;
        this.awareness = new Awareness(this.doc);

        // Register this provider to the room
        const peers = MockHocuspocusProvider.rooms.get(this.name) ?? new Set();
        MockHocuspocusProvider.rooms.set(this.name, peers);
        peers.add(this);

        // Listen for doc updates to broadcast
        this.doc.on("update", this.handleDocUpdate);

        // Listen for awareness updates to broadcast
        // Fix TS error: change "update" to "change" if "update" is not recognized
        this.awareness.on("change", this.handleAwarenessUpdate);

        // Simulate connection in test environment
        setTimeout(() => {
            this.isSynced = true;
            // Emit synced event to simulate successful connection
            this.emit("synced", [{ state: true }]);
            this.emit("status", [{ status: "connected" }]);

            // Sync with existing peers in the room
            this.syncWithPeers();
        }, 10);
    }

    private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
        // Only broadcast if the update originated locally (not from another provider)
        if (origin instanceof MockHocuspocusProvider) return;

        this.broadcastToRoom((peer) => {
            Y.applyUpdate(peer.doc, update, this);
        });
    };

    private handleAwarenessUpdate = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[]; },
        origin: unknown,
    ) => {
        if (origin instanceof MockHocuspocusProvider) return;

        const changedClients = added.concat(updated).concat(removed);
        const update = encodeAwarenessUpdate(this.awareness, changedClients);

        this.broadcastToRoom((peer) => {
            applyAwarenessUpdate(peer.awareness, update, this);
        });
    };

    private broadcastToRoom(action: (peer: MockHocuspocusProvider) => void) {
        const peers = MockHocuspocusProvider.rooms.get(this.name);
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
        const peers = MockHocuspocusProvider.rooms.get(this.name);
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

    public async connect() {
        this.isSynced = true;
        this.emit("synced", [{ state: true }]);
        this.emit("status", [{ status: "connected" }]);
    }

    public disconnect() {
        this.isSynced = false;
        this.emit("status", [{ status: "disconnected" }]);
    }

    public destroy() {
        // Cleanup
        this.doc.off("update", this.handleDocUpdate);
        this.awareness.off("change", this.handleAwarenessUpdate);
        const peers = MockHocuspocusProvider.rooms.get(this.name);
        if (peers) {
            peers.delete(this);
            if (peers.size === 0) {
                MockHocuspocusProvider.rooms.delete(this.name);
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

    // Add required getters for HocuspocusProvider compatibility
    get synced() {
        return this.isSynced;
    }
}

// Mock the y-websocket module for backward compatibility where it's still imported but should be redirected
vi.mock("y-websocket", () => {
    return {
        WebsocketProvider: MockHocuspocusProvider,
    };
});

// Mock the @hocuspocus/provider module
vi.mock("@hocuspocus/provider", () => {
    return {
        HocuspocusProvider: MockHocuspocusProvider,
    };
});
