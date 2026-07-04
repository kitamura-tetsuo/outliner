import { getLogger } from "../../../lib/logger";
const logger = getLogger("prsCursorSync");

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

        type AwarenessState = {
            user?: { userId: string; name: string; color?: string; };
            presence?: { cursor?: { itemId: string; offset: number; }; };
        };

        // Wait for awareness sync instead of manually copying
        let received = false;
        for (let i = 0; i < 20; i++) {
            const states = c2.awareness!.getStates() as Map<number, AwarenessState>;
            received = Array.from(states.values()).some(s => s.presence?.cursor?.itemId === "root");
            if (received) break;
            await new Promise(r => setTimeout(r, 100));
        }

        const states = c2.awareness!.getStates() as Map<number, AwarenessState>;
        logger.debug("States size:", states.size);
        logger.debug("States values:", Array.from(states.values()));
        logger.debug("Received:", received);
        expect(received).toBe(true);

        c1.dispose();
        c2.dispose();
        await new Promise(r => setTimeout(r, 0));
    });
});
