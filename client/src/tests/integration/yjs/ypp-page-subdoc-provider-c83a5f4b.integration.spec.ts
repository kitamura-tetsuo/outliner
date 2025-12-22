import { v4 as uuid } from "uuid";
import { describe, expect, it } from "vitest";
import { createProjectConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

describe("page subdoc provider", () => {
    it("connects each page to its own room with isolated awareness", async () => {
        const projectId = `p-${uuid()}`;
        const conn = await createProjectConnection(projectId);
        const project = Project.fromDoc(conn.doc);
        const p1 = project.addPage("P1", "u1");
        const p2 = project.addPage("P2", "u1");
        await new Promise(r => setTimeout(r, 100));
        const c1 = conn.getPageConnection(p1.id)!;
        const c2 = conn.getPageConnection(p2.id)!;
        expect(c1).toBeDefined();
        expect(c2).toBeDefined();
        expect(c1).not.toBe(c2);
        expect(c1.provider.roomname).toBe(`projects/${projectId}/pages/${p1.id}`);
        expect(c2.provider.roomname).toBe(`projects/${projectId}/pages/${p2.id}`);
        c1.awareness.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        expect(c2.awareness.getLocalState()?.presence).toBeUndefined();
        conn.dispose();
    });
});
