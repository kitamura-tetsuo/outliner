import { describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { yjsService } from "../../../lib/yjs/service";

vi.mock("../../../lib/yjsPersistence", () => ({
    createPersistence: vi.fn(),
    waitForSync: vi.fn().mockResolvedValue(undefined),
    attachIndexedDbPersistence: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
}));

describe("Presence Binding Leak", () => {
    it("should only bind once", async () => {
        const doc = new Y.Doc();
        const awareness = new Awareness(doc);

        const unbind1 = yjsService.bindProjectPresence(awareness);
        const unbind2 = yjsService.bindProjectPresence(awareness);

        expect(unbind1).toBe(unbind2);

        const observers = (awareness as unknown as { _observers: Map<string, unknown>; })._observers;

        // One listener from the initial bind
        expect((observers.get("change") as unknown as Set<() => void>)?.size ?? 0).toBe(1);

        unbind1();

        // Listener should be removed
        expect((observers.get("change") as unknown as Set<() => void>)?.size ?? 0).toBe(0);
    });
});
