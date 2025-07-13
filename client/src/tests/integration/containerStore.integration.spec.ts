import { describe, expect, it } from "vitest";
import { containerStore } from "../../stores/containerStore.svelte";
import { firestoreStore } from "../../stores/firestoreStore.svelte";

describe("ContainerStore integration", () => {
    it("reacts to firestore store updates", () => {
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: ["a"],
            defaultContainerId: "a",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;
        expect(containerStore.containers.length).toBe(1);
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: ["b"],
            defaultContainerId: "b",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;
        expect(containerStore.containers[0].id).toBe("b");
    });
});
