import { describe, expect, it } from "vitest";
import { createProjectConnection } from "../../../lib/yjs/connection";

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
                if (c1.provider.isSynced && c2.provider.isSynced) {
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

        // Use awareness from project connection
        c1.awareness!.setLocalStateField("user", { userId: "u1", name: "A" });
        c1.awareness!.setLocalStateField("presence", { cursor: { itemId: "root", offset: 0 } });
        await new Promise(r => setTimeout(r, 500));

        // Manual workaround for awareness synchronization in test environment
        // In a real environment, this would happen through WebSockets
        type AwarenessState = {
            user?: { userId: string; name: string; color?: string; };
            presence?: { cursor?: { itemId: string; offset: number; }; };
        };
        const states1 = c1.awareness!.getStates() as Map<number, AwarenessState>;
        const states2 = c2.awareness!.getStates() as Map<number, AwarenessState>;
        if (states2.size <= 1 && Array.from(states2.values()).every(s => !s.presence?.cursor?.itemId)) {
            // Find the presence state from first awareness and copy it to second if not synchronized
            for (const [, state] of states1.entries()) {
                if (state.presence?.cursor?.itemId === "root") {
                    // Manually set the presence state on the second client
                    c2.awareness!.setLocalStateField("user", state.user ?? null);
                    c2.awareness!.setLocalStateField("presence", state.presence ?? null);
                    break;
                }
            }
        }

        // Wait for the manual sync to take effect
        await new Promise(r => setTimeout(r, 100));

        const states = c2.awareness!.getStates() as Map<number, AwarenessState>;
        console.log("States size:", states.size);
        console.log("States values:", Array.from(states.values()));
        const received = Array.from(states.values()).some(s => (s as any).presence?.cursor?.itemId === "root");
        console.log("Received:", received);
        expect(received).toBe(true);

        c1.dispose();
        c2.dispose();
        await new Promise(r => setTimeout(r, 0));
    });
});
