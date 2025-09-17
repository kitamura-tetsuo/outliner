// Mock for y-websocket to avoid real WebSocket connections in tests
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

export class WebsocketProvider {
    public doc: Y.Doc;
    public awareness: Awareness;
    public wsconnected: boolean = true;
    public synced: boolean = true;

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
        this.awareness = new Awareness(doc);

        // Simulate connection in test environment
        setTimeout(() => {
            // Emit sync event to simulate successful connection
            this.emit("sync", [true]);
        }, 0);
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

    // Simple event emitter implementation for testing
    private eventListeners: Map<string, Function[]> = new Map();

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

// Export the same interface as the real module
export default { WebsocketProvider };
