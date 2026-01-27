// Manually mock WebSocket and other globals for Node environment to prevent jsdom/socket issues
if (typeof global !== "undefined") {
    if (!global.WebSocket) {
        global.WebSocket = class WebSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;
            readyState: number;
            onopen: ((ev: Event) => any) | null = null;
            onmessage: ((ev: MessageEvent) => any) | null = null;
            onclose: ((ev: CloseEvent) => any) | null = null;
            onerror: ((ev: Event) => any) | null = null;

            constructor(_url: string, _protocols?: string | string[]) {
                void _url;
                void _protocols;
                this.readyState = WebSocket.CONNECTING;
                setTimeout(() => {
                    this.readyState = WebSocket.OPEN;
                    if (this.onopen) this.onopen(new Event("open"));
                }, 10);
            }
            send(_data: any) {
                void _data;
            }
            close() {
                this.readyState = WebSocket.CLOSED;
                if (this.onclose) this.onclose(new CloseEvent("close"));
            }
            addEventListener() {}
            removeEventListener() {}
        } as any;
    }
    if (!global.document) {
        global.document = {
            createElement: vi.fn().mockImplementation((tagName) => {
                if (tagName === "div") return { style: {} };
                return {};
            }),
            dispatchEvent: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        } as any;
    }
    if (!global.window) {
        global.window = global as any;
        global.window.addEventListener = vi.fn();
        global.window.removeEventListener = vi.fn();
        global.window.location = {
            hostname: "localhost",
            protocol: "http:",
        } as any;
    }
}

import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import { createProjectConnection, type PageConnection, setProviderClass } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

// Mock firebase-app to prevent initialization error
vi.mock("../../../lib/firebase-app", () => ({
    app: {},
    auth: {
        currentUser: { uid: "test-user" },
        onAuthStateChanged: vi.fn(),
    },
    db: {},
}));

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => ({ uid: "test-user" }),
        onAuthStateChanged: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    },
}));

// Mock HocuspocusProvider
class MockHocuspocusProvider extends EventEmitter {
    configuration: any;
    document: any;
    awareness: any;

    constructor(config: any) {
        super();
        this.configuration = config;
        this.document = config.document;
        this.awareness = {
            clientID: 123,
            getLocalState: () => ({ presence: this._presence }),
            setLocalStateField: (field: string, value: any) => {
                if (field === "presence") this._presence = value;
            },
            on: () => {},
            off: () => {},
            destroy: () => {},
        };
        // Simulate immediate connection
        setTimeout(() => this.emit("status", { status: "connected" }), 0);
        setTimeout(() => this.emit("synced", { state: true }), 0);
    }
    _presence: any = undefined;

    connect() {}
    disconnect() {}
    destroy() {}
}
setProviderClass(MockHocuspocusProvider as any);

// Mock store to avoid $state (runes) error in integration tests pending environment fix
vi.mock("../../../stores/store.svelte", () => ({
    store: {
        project: undefined,
        pages: { current: [] },
    },
    GeneralStore: class {},
}));
vi.mock("../../../stores/yjsStore.svelte", () => ({
    yjsStore: { isConnected: true },
}));
// Removed local y-websocket mock as it's now handled by the global mock in setup.ts for both y-websocket and @hocuspocus/provider

vi.mock("../../../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        setUser: () => {},
        setAwarenessState: () => {},
    },
}));
vi.mock("../../../stores/PresenceStore.svelte", () => ({
    presenceStore: {
        setUser: () => {},
        setAwarenessState: () => {},
    },
}));

async function waitForPageConnection(
    conn: { getPageConnection: (id: string) => PageConnection | undefined; },
    pageId: string,
    timeoutMs: number = 30000,
): Promise<PageConnection> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const pageConn = conn.getPageConnection(pageId);
        if (pageConn) return pageConn;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timeout waiting for page connection: ${pageId}`);
}

describe("page subdoc provider", () => {
    it("connects each page to its own room with isolated awareness", async () => {
        const projectId = `p-${Date.now()}`;
        const conn = await createProjectConnection(projectId);
        const project = Project.fromDoc(conn.doc);
        const p1 = project.addPage("P1", "u1");
        const p2 = project.addPage("P2", "u1");

        // Wait for page connections to be established
        const c1 = await waitForPageConnection(conn, p1.id);
        const c2 = await waitForPageConnection(conn, p2.id);

        // HocuspocusProvider stores the room name in the 'name' property
        expect(c1.provider.configuration.name).toBe(`projects/${projectId}/pages/${p1.id}`);
        expect(c2.provider.configuration.name).toBe(`projects/${projectId}/pages/${p2.id}`);

        // Use non-null assertions for awareness as they are checked by waitForPageConnection
        c1.awareness!.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        expect(c2.awareness!.getLocalState()?.presence).toBeUndefined();

        c2.dispose();
        conn.dispose();
    }, 60000);
});
