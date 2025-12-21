import { describe, expect, it } from "vitest";
import { createProjectConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

/**
 * Helper to wait for page connections to become available.
 * This addresses a race condition where `connectPageDoc` is called asynchronously
 * and may not complete within a fixed timeout, especially when running in a full test suite.
 */
async function waitForPageConnection(
    conn: Awaited<ReturnType<typeof createProjectConnection>>,
    pageId: string,
    timeoutMs = 15000,
) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const c = conn.getPageConnection(pageId);
        if (c) return c;
        await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Page connection for ${pageId} not available within ${timeoutMs}ms`);
}

describe("page subdoc provider", () => {
    it("connects each page to its own room with isolated awareness", async () => {
        const projectId = `p-${Date.now()}`;
        const conn = await createProjectConnection(projectId);
        const project = Project.fromDoc(conn.doc);
        const p1 = project.addPage("P1", "u1");
        const p2 = project.addPage("P2", "u1");
        // Wait for page connections to be established (async operation)
        const c1 = await waitForPageConnection(conn, p1.id);
        const c2 = await waitForPageConnection(conn, p2.id);
        expect(c1.provider.roomname).toBe(`projects/${projectId}/pages/${p1.id}`);
        expect(c2.provider.roomname).toBe(`projects/${projectId}/pages/${p2.id}`);
        c1.awareness.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        expect(c2.awareness.getLocalState()?.presence).toBeUndefined();
        conn.dispose();
    });
});
