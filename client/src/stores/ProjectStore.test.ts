import { beforeEach, describe, expect, it, vi } from "vitest";
import { firestoreStore, type UserProject } from "./firestoreStore.svelte";
import { projectStore } from "./projectStore.svelte";

// Neutral title provider mock
vi.mock("../lib/projectTitleProvider", () => ({
    getProjectTitle: vi.fn((id: string) => {
        const titles: Record<string, string> = {
            "p1": "テストプロジェクト1",
            "p2": "テストプロジェクト2",
        };
        return titles[id] || "デフォルトプロジェクト";
    }),
}));

describe("ProjectStore", () => {
    beforeEach(() => {
        firestoreStore.userProject = {
            userId: "test",
            accessibleProjectIds: ["p1", "p2"],
            defaultProjectId: "p1",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as UserProject;
        // Trigger sync to update projectStore
        projectStore.syncFromFirestore();
    });

    it("maps firestore projects to info objects", () => {
        const list = projectStore.projects;
        expect(list.length).toBe(2);
        expect(list[0].id).toBe("p1");
        expect(list[0].name).toBe("テストプロジェクト1");
        expect(list[0].isDefault).toBe(true);
        expect(list[1].id).toBe("p2");
        expect(list[1].name).toBe("テストプロジェクト2");
        expect(list[1].isDefault).toBe(false);
    });
});
