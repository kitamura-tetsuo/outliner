import { beforeEach, describe, expect, it, vi } from "vitest";

const { listAccessibleProjects } = vi.hoisted(() => ({ listAccessibleProjects: vi.fn() }));
vi.mock("../services/projectDirectoryService", () => ({ listAccessibleProjects }));

import { firestoreStore } from "./firestoreStore.svelte";
import { projectStore } from "./projectStore.svelte";

describe("ProjectStore", () => {
    beforeEach(() => projectStore.reset());

    it("uses canonical resource-side descriptors", async () => {
        listAccessibleProjects.mockResolvedValue([
            { projectId: "p1", title: "Test Project 1" },
            { projectId: "p2", title: "Test Project 2" },
        ]);
        await projectStore.refresh();
        expect(projectStore.projects).toEqual([
            { id: "p1", name: "Test Project 1", isDefault: false },
            { id: "p2", name: "Test Project 2", isDefault: false },
        ]);
    });

    it("merges the per-user default preference without using it as a directory", async () => {
        firestoreStore.setUserProject({
            userId: "test-user",
            defaultProjectId: "p2",
            accessibleProjectIds: ["forged-id"],
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        listAccessibleProjects.mockResolvedValue([
            { projectId: "p1", title: "One" },
            { projectId: "p2", title: "Two" },
        ]);
        await projectStore.refresh();
        expect(projectStore.projects.map(project => [project.id, project.isDefault])).toEqual([
            ["p1", false],
            ["p2", true],
        ]);
    });
});
