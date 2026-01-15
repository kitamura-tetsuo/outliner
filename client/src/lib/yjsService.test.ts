import { describe, expect, it, vi } from "vitest";
import {
    createNewProject,
    getClientByProjectTitle,
    stableIdFromTitle,
} from "./yjsService.svelte";

// Mock the YjsClient to prevent network connections during tests.
vi.mock("../yjs/YjsClient", () => ({
    YjsClient: class {
        doc: { guid: string };
        project: any;

        constructor(projectId: string, project: any) {
            this.doc = { guid: projectId };
            this.project = project;
        }

        getProject() {
            return this.project;
        }

        static async connect(projectId: string, project: any) {
            // Return a mock client instance that satisfies the test's assertions.
            return Promise.resolve({
                doc: {
                    guid: projectId,
                },
                getProject: () => project,
            });
        }
    },
}));

describe("yjsService", () => {
    describe("getClientByProjectTitle", () => {
        it("reloads project from metaDoc after registry is cleared", async () => {
            // 1. Create project "TestProject" and wait for sync.
            const originalClient = await createNewProject("TestProject");
            expect(originalClient).toBeDefined();

            // 2. Clear in-memory registry to simulate a refresh.
            // The registry is stored on the window object for persistence across module reloads.
            if ((window as any).__YJS_CLIENT_REGISTRY__) {
                (window as any).__YJS_CLIENT_REGISTRY__.map.clear();
            }

            // 3. Call getClientByProjectTitle("TestProject").
            const reloadedClient = await getClientByProjectTitle("TestProject");

            // 4. Assert client is returned and has correct ID.
            expect(reloadedClient).toBeDefined();
            expect(reloadedClient!.doc.guid).toBe(originalClient.doc.guid);

            // Verify the stable ID matches what's expected
            const expectedId = stableIdFromTitle("TestProject");
            expect(reloadedClient!.doc.guid.startsWith(expectedId)).toBe(true);
        });
    });
});
