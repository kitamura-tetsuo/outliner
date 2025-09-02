import { describe, expect, it } from "vitest";
import { createProjectConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

describe("yjs presence", () => {
    it("propagates cursor between clients", async () => {
        const projectId = `p-${Date.now()}`;
        const c1 = await createProjectConnection(projectId);
        const c2 = await createProjectConnection(projectId);
        const project = Project.fromDoc(c1.doc);
        const page = project.addPage("P1", "u1");
        await new Promise(r => setTimeout(r, 100));
        const p1c1 = c1.getPageConnection(page.id)!;
        const p1c2 = c2.getPageConnection(page.id)!;
        p1c1.awareness.setLocalState({
            user: { userId: "u1", name: "A" },
            presence: { cursor: { itemId: "root", offset: 0 } },
        });
        await new Promise(r => setTimeout(r, 500));
        const states = p1c2.awareness.getStates();
        const received = Array.from(states.values()).some(s => s.presence?.cursor?.itemId === "root");
        expect(received).toBe(true);
        c1.dispose();
        c2.dispose();
    });
});
