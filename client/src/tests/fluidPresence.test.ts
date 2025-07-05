import { EventEmitter } from "events";
import { describe, expect, it } from "vitest";
import { FluidClient } from "../fluid/fluidClient";
import { presenceStore } from "../stores/PresenceStore.svelte";

class FakeAudience extends EventEmitter {
    members = new Map<string, any>();
    getMembers() {
        return this.members;
    }
    getMyself() {
        return undefined;
    }
}

describe("fluid presence integration", () => {
    it("updates presence when members change", () => {
        const audience = new FakeAudience();
        const services: any = { audience };
        const dummy: any = { on: () => {}, off: () => {} };
        const client = new FluidClient({
            clientId: "c1",
            client: dummy,
            container: dummy,
            containerId: "cid",
            appData: dummy,
            project: dummy,
            services,
        });
        audience.members.set("u1", { name: "Bob", user: { id: "u1" } });
        audience.emit("membersChanged");
        expect(presenceStore.users["u1"].userName).toBe("Bob");
    });
});
