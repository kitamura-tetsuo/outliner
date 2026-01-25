import { beforeEach, describe, expect, it, vi } from "vitest";
import { firestoreStore, type UserProject } from "./firestoreStore.svelte";
import { projectStore } from "./projectStore.svelte";

// Mock metaDoc module for project titles
vi.mock("../lib/metaDoc.svelte", () => ({
    getProjectTitleFromMetaDoc: vi.fn((id: string) => {
        const titles: Record<string, string> = {
            "p1": "Test Project 1",
            "p2": "Test Project 2",
        };
        return titles[id] || "";
    }),
}));

// Neutral title provider mock (fallback)
vi.mock("../lib/projectTitleProvider", () => ({
    getProjectTitle: vi.fn((id: string) => {
        const titles: Record<string, string> = {
            "p1": "Test Project 1",
            "p2": "Test Project 2",
        };
        return titles[id] || "Default Project";
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
        expect(list[0].name).toBe("Test Project 1");
        expect(list[0].isDefault).toBe(true);
        expect(list[1].id).toBe("p2");
        expect(list[1].name).toBe("Test Project 2");
        expect(list[1].isDefault).toBe(false);
    });
});
