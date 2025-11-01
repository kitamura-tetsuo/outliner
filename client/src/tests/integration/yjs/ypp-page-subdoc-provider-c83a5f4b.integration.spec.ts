import { describe, expect, it } from "vitest";
import { createProjectConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

describe("page subdoc provider", () => {
    it("connects each page to its own room with isolated awareness", async () => {
        const projectId = `p-${Date.now()}`;
        const conn = await createProjectConnection(projectId);
        const project = Project.fromDoc(conn.doc);
        const p1 = project.addPage("P1", "u1");
        const p2 = project.addPage("P2", "u1");

        // Wait for page connections to be established
        // Since adding a page creates subdocs asynchronously, we need to wait for the connection to be established
        const c1 = await new Promise((resolve, reject) => {
            let resolved = false;
            const check = () => {
                const pageConn = conn.getPageConnection(p1.id);
                if (pageConn) {
                    resolved = true;
                    resolve(pageConn);
                } else if (!resolved) {
                    setTimeout(check, 50);
                }
            };
            setTimeout(check, 0);
            // Set timeout for resolution
            setTimeout(() => {
                if (!resolved) {
                    reject(new Error("Timeout waiting for page connection p1"));
                }
            }, 10000);
        });

        const c2 = await new Promise((resolve, reject) => {
            let resolved = false;
            const check = () => {
                const pageConn = conn.getPageConnection(p2.id);
                if (pageConn) {
                    resolved = true;
                    resolve(pageConn);
                } else if (!resolved) {
                    setTimeout(check, 50);
                }
            };
            setTimeout(check, 0);
            // Set timeout for resolution
            setTimeout(() => {
                if (!resolved) {
                    reject(new Error("Timeout waiting for page connection p2"));
                }
            }, 10000);
        });

        expect(c1.provider.roomname).toBe(`projects/${projectId}/pages/${p1.id}`);
        expect(c2.provider.roomname).toBe(`projects/${projectId}/pages/${p2.id}`);
        c1.awareness.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        expect(c2.awareness.getLocalState()?.presence).toBeUndefined();
        conn.dispose();
    });
});
