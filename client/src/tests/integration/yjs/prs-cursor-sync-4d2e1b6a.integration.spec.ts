import { describe, expect, it } from "vitest";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { createProjectConnection } from "../../../lib/yjs/connection";

describe("yjs presence", () => {
    it("propagates cursor between clients", async () => {
        const projectId = `p-${Date.now()}`;
        const c1 = await createProjectConnection(projectId);
        const c2 = await createProjectConnection(projectId);
        c1.awareness.setLocalStateField("presence", { cursor: { itemId: "root", offset: 0 } });
        const clientId = (c1.awareness as any).clientID;
        const update = encodeAwarenessUpdate(c1.awareness, [clientId]);
        applyAwarenessUpdate(c2.awareness, update, clientId);
        const states = c2.awareness.getStates();
        const received = Array.from(states.values()).some((s: any) => s.presence?.cursor?.itemId === "root");
        expect(received).toBe(true);
        c1.dispose();
        c2.dispose();
    });
});
