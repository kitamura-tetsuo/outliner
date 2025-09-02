import { BroadcastChannel } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { YjsPresenceService } from "../../lib/yjs/service";
import { presenceStore } from "../../stores/PresenceStore.svelte";

(globalThis as any).BroadcastChannel = BroadcastChannel;

describe("yjs presence integration", () => {
    it("removes users when disconnected", async () => {
        presenceStore.users = {} as any;
        const s1 = new YjsPresenceService("room2", { userId: "u1", userName: "U1" });
        const s2 = new YjsPresenceService("room2", { userId: "u2", userName: "U2" });
        await new Promise(r => setTimeout(r, 50));
        s2.destroy();
        await new Promise(r => setTimeout(r, 100));
        expect(presenceStore.users["u2"]).toBeUndefined();
        s1.destroy();
    });
});
