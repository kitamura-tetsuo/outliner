import { beforeEach, describe, expect, it } from "vitest";
import { containerStore } from "./containerStore.svelte";
import { firestoreStore, type UserContainer } from "./firestoreStore.svelte";

describe("ContainerStore", () => {
    beforeEach(() => {
        firestoreStore.userContainer = {
            userId: "test",
            accessibleContainerIds: ["c1", "c2"],
            defaultContainerId: "c1",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as UserContainer;
    });

    it("maps firestore containers to info objects", () => {
        const list = containerStore.containers;
        expect(list.length).toBe(2);
        expect(list[0].id).toBe("c1");
        expect(list[0].isDefault).toBe(true);
    });
});
