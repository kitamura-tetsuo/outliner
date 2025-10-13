import { describe, expect, it } from "vitest";
import { createProjectConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

// TODO: Re-enable this test once YJS mocking is properly implemented
describe("yjs presence", () => {
    it.skip("propagates cursor between clients", async () => {
        const projectId = `p-${Date.now()}`;
        const c1 = await createProjectConnection(projectId);
        const c2 = await createProjectConnection(projectId);
        const project = Project.fromDoc(c1.doc);
        const page = project.addPage("P1", "u1");
        // Wait for page connections to be established
        const waitFor = async <T>(fn: () => T | undefined, timeout = 1000) => {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const v = fn();
                if (v) return v;
                await new Promise(r => setTimeout(r, 25));
            }
            return fn();
        };
        const p1c1 = await waitFor(() => c1.getPageConnection(page.id));
        const p1c2 = await waitFor(() => c2.getPageConnection(page.id));
        if (!p1c1 || !p1c2) throw new Error("page connection not established");
        p1c1.awareness.setLocalState({
            user: { userId: "u1", name: "A" },
            presence: { cursor: { itemId: "root", offset: 0 } },
        });
        await new Promise(r => setTimeout(r, 500));
        const states = p1c2.awareness.getStates();
        const received = Array.from(states.values()).some(s => s.presence?.cursor?.itemId === "root");
        expect(received).toBe(true);
        p1c1.dispose();
        p1c2.dispose();
        c1.dispose();
        c2.dispose();
        await new Promise(r => setTimeout(r, 0));
    });
});
