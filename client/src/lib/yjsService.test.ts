import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from "vitest";
import { Project } from "../schema/yjs-schema";
import { createNewProject, getClientByProjectTitle, stableIdFromTitle, deleteProject } from "./yjsService.svelte";

// Define a type for the window object to avoid using 'any'
interface TestWindow extends Window {
    __YJS_CLIENT_REGISTRY__?: {
        map: {
            clear: () => void;
        };
    };
}

// Mock the YjsClient to prevent network connections during tests.
vi.mock("../yjs/YjsClient", () => ({
    YjsClient: class {
        doc: { guid: string; };
        project: Project;

        constructor(projectId: string, project: Project) {
            this.doc = { guid: projectId };
            this.project = project;
        }

        getProject(): Project {
            return this.project;
        }

        static async connect(projectId: string, project: Project) {
            // Return a mock client instance that satisfies the test's assertions.
            return Promise.resolve({
                doc: {
                    guid: projectId,
                },
                project,
                getProject: () => project,
            } as any);
        }
    },
}));

vi.mock("../auth/UserManager", () => ({
    userManager: {
        auth: {
            currentUser: {
                getIdToken: vi.fn().mockResolvedValue("mock-token"),
            },
        },
        getCurrentUser: vi.fn().mockReturnValue({ id: "test-user-id" }),
    },
}));

vi.mock("./firebaseFunctionsUrl", () => ({
    getFirebaseFunctionUrl: vi.fn().mockReturnValue("http://localhost/api/deleteProject"),
}));

describe("yjsService", () => {
    describe("getClientByProjectTitle", () => {
        it("reloads project from metaDoc after registry is cleared", async () => {
            // 1. Create project "TestProject" and wait for sync.
            const originalClient = await createNewProject("TestProject");
            expect(originalClient).toBeDefined();

            // 2. Clear in-memory registry to simulate a refresh.
            // The registry is stored on the window object for persistence across module reloads.
            const testWindow = window as TestWindow;
            if (testWindow.__YJS_CLIENT_REGISTRY__) {
                testWindow.__YJS_CLIENT_REGISTRY__.map.clear();
            }

            // 3. Call getClientByProjectTitle("TestProject").
            const reloadedClient = await getClientByProjectTitle("TestProject");

            // 4. Assert client is returned and has correct ID.
            expect(reloadedClient).toBeDefined();
            expect((reloadedClient as any).doc.guid).toBe((originalClient as any).doc.guid);

            // Verify the stable ID matches what's expected
            const expectedId = stableIdFromTitle("TestProject");
            expect((reloadedClient as any).doc.guid.startsWith(expectedId)).toBe(true);
        });
    });

    describe("deleteProject", () => {
        const originalFetch = global.fetch;

        beforeEach(() => {
            global.fetch = vi.fn();
        });

        afterEach(() => {
            global.fetch = originalFetch;
        });

        it("should call deleteProject function with correct parameters", async () => {
            (global.fetch as Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            });

            const result = await deleteProject("project-123");

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(
                "http://localhost/api/deleteProject",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        "Content-Type": "application/json",
                    }),
                    body: JSON.stringify({
                        idToken: "mock-token",
                        projectId: "project-123",
                    }),
                })
            );
        });

        it("should throw error if fetch fails", async () => {
            (global.fetch as Mock).mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                text: async () => "Error details",
            });

            await expect(deleteProject("project-123")).rejects.toThrow("Failed to delete project: Internal Server Error");
        });
    });
});
