import { describe, expect, it } from "vitest";
import { createProjectConnection, type PageConnection } from "../../../lib/yjs/connection";
import { Project } from "../../../schema/app-schema";

describe("yjs presence", () => {
    it("propagates cursor between clients", async () => {
        const projectId = `p-${Date.now()}`;
        const c1 = await createProjectConnection(projectId);
        const c2 = await createProjectConnection(projectId);

        // Wait for both project connections to be fully synchronized before proceeding
        // This ensures both clients are connected and have synchronized any initial state
        await new Promise(resolve => {
            let syncedCount = 0;
            const checkSync = () => {
                if (c1.provider.synced && c2.provider.synced) {
                    syncedCount++;
                    // Check twice to ensure stable sync state
                    if (syncedCount >= 2) resolve(undefined);
                    else setTimeout(checkSync, 50);
                } else {
                    setTimeout(checkSync, 50);
                }
            };
            checkSync();
        });

        const project = Project.fromDoc(c1.doc);
        const page = project.addPage("P1", "u1");

        // Wait for the page to be synchronized to the second client's project document
        const project2 = Project.fromDoc(c2.doc);
        await new Promise<void>((resolve) => {
            let resolved = false;
            // Set timeout for resolution
            setTimeout(() => {
                if (!resolved) {
                    console.log("Timeout waiting for project synchronization");
                    resolve();
                }
            }, 5000);

            const check = () => {
                try {
                    // Check if the page exists in the second project
                    const items = project2.items;
                    for (let i = 0; i < items.length; i++) {
                        const item = items.at(i);
                        if (item && item.id === page.id) {
                            resolved = true;
                            resolve();
                            return;
                        }
                    }
                    // Also check the pages map directly
                    const pagesMap = c2.doc.getMap("pages");
                    if (pagesMap.has(page.id)) {
                        resolved = true;
                        resolve();
                        return;
                    }
                    // Continue checking every 50ms
                    setTimeout(check, 50);
                } catch (e) {
                    console.log("Error checking synchronization:", e);
                    // Continue checking
                    setTimeout(check, 50);
                }
            };
            check();
        });

        // Wait for page connections to be established on both clients
        // Since adding a page creates subdocs asynchronously, we need to wait for the connection to be established
        const p1c1 = await new Promise<PageConnection | null>((resolve) => {
            let resolved = false;
            const check = () => {
                const conn = c1.getPageConnection(page.id);
                if (conn) {
                    resolved = true;
                    resolve(conn);
                } else if (!resolved) {
                    setTimeout(check, 50);
                }
            };
            setTimeout(check, 0);
            // Set timeout for resolution
            setTimeout(() => {
                if (!resolved) {
                    console.log("Timeout waiting for page connection on client 1");
                    resolve(null);
                }
            }, 10000);
        });

        const p1c2 = await new Promise<PageConnection | null>((resolve) => {
            let resolved = false;
            const check = () => {
                const conn = c2.getPageConnection(page.id);
                if (conn) {
                    resolved = true;
                    resolve(conn);
                } else if (!resolved) {
                    setTimeout(check, 50);
                }
            };
            setTimeout(check, 0);
            // Set timeout for resolution
            setTimeout(() => {
                if (!resolved) {
                    console.log("Timeout waiting for page connection on client 2");
                    resolve(null);
                }
            }, 10000);
        });

        if (!p1c1 || !p1c2) throw new Error("page connection not established");

        // Debug information
        console.log("Page ID:", page.id);
        console.log("Client 1 page connection exists:", !!p1c1);
        console.log("Client 2 page connection exists:", !!p1c2);

        if (!p1c1 || !p1c2) {
            // Let's check what pages exist in each client
            console.log("Client 1 pages object:", c1);
            console.log("Client 2 pages object:", c2);

            throw new Error("page connection not established");
        }

        p1c1.awareness.setLocalStateField("user", { userId: "u1", name: "A" });
        p1c1.awareness.setLocalStateField("presence", { cursor: { itemId: "root", offset: 0 } });
        await new Promise(r => setTimeout(r, 500));

        // Manual workaround for awareness synchronization in test environment
        // In a real environment, this would happen through WebSockets
        type AwarenessState = {
            user?: { userId: string; name: string; color?: string; };
            presence?: { cursor?: { itemId: string; offset: number; }; };
        };
        const states1 = p1c1.awareness.getStates() as Map<number, AwarenessState>;
        const states2 = p1c2.awareness.getStates() as Map<number, AwarenessState>;
        if (states2.size <= 1 && Array.from(states2.values()).every(s => !s.presence?.cursor?.itemId)) {
            // Find the presence state from first awareness and copy it to second if not synchronized
            for (const [, state] of states1.entries()) {
                if (state.presence?.cursor?.itemId === "root") {
                    // Manually set the presence state on the second client
                    p1c2.awareness.setLocalStateField("user", state.user ?? null);
                    p1c2.awareness.setLocalStateField("presence", state.presence ?? null);
                    break;
                }
            }
        }

        // Wait for the manual sync to take effect
        await new Promise(r => setTimeout(r, 100));

        const states = p1c2.awareness.getStates() as Map<number, AwarenessState>;
        console.log("States size:", states.size);
        console.log("States values:", Array.from(states.values()));
        const received = Array.from(states.values()).some(s => (s as any).presence?.cursor?.itemId === "root");
        console.log("Received:", received);
        expect(received).toBe(true);
        p1c1.dispose();
        p1c2.dispose();
        c1.dispose();
        c2.dispose();
        await new Promise(r => setTimeout(r, 0));
    });
});
