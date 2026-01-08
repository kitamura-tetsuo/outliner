import { describe, expect, it, vi } from "vitest";
import { createProjectConnection, type PageConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

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
vi.mock("y-websocket", () => ({
    WebsocketProvider: class {
        roomname: string;
        awareness: any;
        on: any;
        connect: any;
        disconnect: any;
        destroy: any;
        synced = false;
        constructor(serverUrl: string, roomname: string) {
            this.roomname = roomname;
            this.awareness = {
                setLocalStateField: () => {},
                getLocalState: () => ({}),
                getStates: () => new Map(),
                on: () => {},
            };
            this.on = (event: string, cb: () => void) => {
                if (event === "sync") cb(); // auto-sync
            };
            this.connect = () => {};
            this.disconnect = () => {};
            this.destroy = () => {};
            setTimeout(() => this.synced = true, 0);
        }
    },
}));
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
    timeoutMs: number = 10000,
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

        expect(c1.provider.roomname).toBe(`projects/${projectId}/pages/${p1.id}`);
        expect(c2.provider.roomname).toBe(`projects/${projectId}/pages/${p2.id}`);
        c1.awareness.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        expect(c2.awareness.getLocalState()?.presence).toBeUndefined();
        c2.dispose();
        conn.dispose();
    }, 30000);
});
