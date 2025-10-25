// Setup file for integration tests
import { vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

// Enhanced mock for y-websocket to simulate WebSocket connections in tests
class MockWebsocketProvider {
    public doc: Y.Doc;
    public awareness: Awareness;
    public wsconnected: boolean = true;
    public synced: boolean = true;
    public roomname: string;

    // Simple event emitter implementation for testing
    private eventListeners: Map<string, Function[]> = new Map();

    constructor(
        serverUrl: string,
        roomname: string,
        doc: Y.Doc,
        options?: {
            connect?: boolean;
            params?: Record<string, string>;
        },
    ) {
        this.doc = doc;
        this.roomname = roomname;
        this.awareness = new Awareness(doc);

        // Simulate connection in test environment
        setTimeout(() => {
            // Emit sync event to simulate successful connection
            this.emit("sync", [true]);
            this.emit("status", [{ connected: true }]);
        }, 0);

        // Simulate subdocs event when pages are added
        const simulateSubdocs = () => {
            try {
                // Listen for changes to the "pages" map
                const pagesMap = doc.getMap<Y.Doc>("pages");
                pagesMap.observe((event: any) => {
                    const addedDocs: Y.Doc[] = [];
                    const removedDocs: Y.Doc[] = [];

                    // Process added subdocuments
                    for (const key of event.keysChanged as Set<string>) {
                        const subdoc = pagesMap.get(key);
                        if (subdoc) {
                            addedDocs.push(subdoc);
                        }
                    }

                    // Emit subdocs event if there are changes
                    if (addedDocs.length > 0 || removedDocs.length > 0) {
                        const subdocsEvent = {
                            added: new Set(addedDocs),
                            removed: new Set(removedDocs),
                            loaded: new Set<Y.Doc>(),
                        };
                        this.emit("subdocs", [subdocsEvent]);
                    }
                });
            } catch (_) {
                // Ignore errors in test environment
            }
        };

        // Schedule the subdocs simulation
        setTimeout(simulateSubdocs, 10);
    }

    public connect() {
        this.wsconnected = true;
    }

    public disconnect() {
        this.wsconnected = false;
    }

    public destroy() {
        // Cleanup
    }

    public on(event: string, callback: Function) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)?.push(callback);
    }

    public off(event: string, callback: Function) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    public emit(event: string, args: any[] = []) {
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
