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

        // HocuspocusProvider stores the room name in the 'name' property
        expect(c1.provider.configuration.name).toBe(`projects/${projectId}/pages/${p1.id}`);
        expect(c2.provider.configuration.name).toBe(`projects/${projectId}/pages/${p2.id}`);

        // Use non-null assertions for awareness as they are checked by waitForPageConnection
        c1.awareness!.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        expect(c2.awareness!.getLocalState()?.presence).toBeUndefined();

        c2.dispose();
        conn.dispose();
    }, 30000);
});
