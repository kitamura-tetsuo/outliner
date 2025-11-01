import { describe, expect, it } from "vitest";
import { createProjectConnection, type PageConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

describe("page subdoc provider", () => {
    it("connects each page to its own room with isolated awareness", async () => {
        const projectId = `p-${Date.now()}`;
        const conn = await createProjectConnection(projectId);
        const project = Project.fromDoc(conn.doc);
        const p1 = project.addPage("P1", "u1");
        const p2 = project.addPage("P2", "u1");

        // Wait for page connections to be established
        // The connection setup is asynchronous, so we need to retry
        let c1: PageConnection | undefined, c2: PageConnection | undefined;
        for (let i = 0; i < 50; i++) {
            c1 = conn.getPageConnection(p1.id);
            c2 = conn.getPageConnection(p2.id);
            if (c1 && c2) break;
            await new Promise(r => setTimeout(r, 50));
        }

        expect(c1).toBeDefined();
        expect(c2).toBeDefined();
        expect(c1.provider.roomname).toBe(`projects/${projectId}/pages/${p1.id}`);
        expect(c2.provider.roomname).toBe(`projects/${projectId}/pages/${p2.id}`);
        c1.awareness.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        expect(c2.awareness.getLocalState()?.presence).toBeUndefined();
        conn.dispose();
    });
});
