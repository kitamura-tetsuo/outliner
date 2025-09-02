import { BroadcastChannel } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { initYjsPresence, YjsPresenceService } from "../lib/yjs/service";
import { presenceStore } from "../stores/PresenceStore.svelte";

(globalThis as any).BroadcastChannel = BroadcastChannel;

describe("yjs presence service", () => {
    it("shares presence across instances", async () => {
        presenceStore.users = {} as any;
        initYjsPresence("room1", { userId: "u1", userName: "User1" });
        new YjsPresenceService("room1", { userId: "u2", userName: "User2" });
        await new Promise(r => setTimeout(r, 50));
        expect(presenceStore.users["u1"]).toBeDefined();
        expect(presenceStore.users["u2"]).toBeDefined();
    });
});
