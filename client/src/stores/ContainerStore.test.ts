import { beforeEach, describe, expect, it, vi } from "vitest";
import { containersFromUserContainer, containerStore } from "./containerStore.svelte";
import { firestoreStore, type UserContainer } from "./firestoreStore.svelte";

// Mock container title cache
vi.mock("../lib/containerTitleCache", () => ({
    containerTitleCache: {
        getTitle: vi.fn(),
        setTitle: vi.fn(),
        removeTitle: vi.fn(),
        getAllTitles: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn(),
    },
}));

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
    let mockCache: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Get the mocked cache
        const { containerTitleCache } = await import("../lib/containerTitleCache");
        mockCache = containerTitleCache;
        mockCache.getTitle.mockReturnValue(undefined);

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

    it("uses cached titles when available", () => {
        mockCache.getTitle.mockImplementation((id: string) => {
            if (id === "c1") return "Cached Project 1";
            return undefined;
        });

        const containers = containersFromUserContainer(firestoreStore.userContainer!);

        expect(containers[0].name).toBe("Cached Project 1");
        expect(containers[1].name).toBe("テストプロジェクト2"); // Falls back to registry
    });

    it("falls back to test project name when no title available in test env", async () => {
        // Mock empty cache and empty registry
        mockCache.getTitle.mockReturnValue(undefined);
        const { getProjectTitle } = await import("../lib/projectTitleProvider");
        vi.mocked(getProjectTitle).mockReturnValue("");

        const userContainer = {
            userId: "test",
            accessibleContainerIds: ["unknown-container"],
            defaultContainerId: "unknown-container",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as UserContainer;

        const containers = containersFromUserContainer(userContainer);

        // In test environment, should use test project name format
        expect(containers[0].name).toMatch(/テストプロジェクト/);
        expect(containers[0].name).toContain("iner"); // Last 4 chars of "unknown-container"
    });

    it("handles container names correctly in test environment", () => {
        // Reset mock to ensure clean state
        mockCache.getTitle.mockReturnValue(undefined);
        mockCache.setTitle.mockClear();

        const containers = containersFromUserContainer(firestoreStore.userContainer!);

        // Verify containers are created with proper names
        expect(containers).toHaveLength(2);
        expect(containers[0].id).toBe("c1");
        expect(containers[1].id).toBe("c2");

        // In test environment, when registry returns empty, should use test project format
        // The actual behavior shows "テストプロジェクトc1" format
        expect(containers[0].name).toMatch(/テストプロジェクト/);
        expect(containers[1].name).toMatch(/テストプロジェクト/);
    });
});
