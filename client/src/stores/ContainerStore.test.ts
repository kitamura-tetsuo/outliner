import { beforeEach, describe, expect, it, vi } from "vitest";
import { containerStore } from "./containerStore.svelte";
import { firestoreStore, type UserContainer } from "./firestoreStore.svelte";

// Neutral title provider mock
vi.mock("../lib/projectTitleProvider", () => ({
    getProjectTitle: vi.fn((id: string) => {
        const titles: Record<string, string> = {
            "c1": "テストプロジェクト1",
            "c2": "テストプロジェクト2",
        };
        return titles[id] || "デフォルトプロジェクト";
    }),
}));

describe("ContainerStore", () => {
    beforeEach(() => {
        firestoreStore.userContainer = {
            userId: "test",
            accessibleContainerIds: ["c1", "c2"],
            defaultContainerId: "c1",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as UserContainer;
        // Trigger sync to update containerStore
        containerStore.syncFromFirestore();
    });

    it("maps firestore containers to info objects", () => {
        const list = containerStore.containers;
        expect(list.length).toBe(2);
        expect(list[0].id).toBe("c1");
        expect(list[0].name).toBe("テストプロジェクト1");
        expect(list[0].isDefault).toBe(true);
        expect(list[1].id).toBe("c2");
        expect(list[1].name).toBe("テストプロジェクト2");
        expect(list[1].isDefault).toBe(false);
    });
});
